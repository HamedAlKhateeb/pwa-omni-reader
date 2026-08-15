/**
 * Design reminder — «مرسم التصفّح»: the extension bridge is local-first.
 * It shares only the reader's documented sync keys with the installed extension.
 */
import type { Article, ExportBundle, Highlight, Note, ReaderSettings } from "./types";
import { defaultReaderSettings } from "./types";
import { cleanHtml, savedAtOf, toEpochMillis } from "./article";

const CHANNEL = "masar-omni-reader-bridge";
const REQUEST_TIMEOUT = 4500;
const SYNC_KEYS = ["reader_bookmarks", "reader_folders", "reader_notes", "reader_highlights", "reader_positions", "reader_theme", "reader_font_size", "reader_font", "reader_align", "reader_width", "reader_line_height", "reader_word_spacing", "reader_rtl", "reader_show_photos", "library_bg_color"];

type ExtensionSnapshot = Record<string, unknown>;
type BridgeResponse = { channel: string; type: string; requestId: string; ok: boolean; data?: ExtensionSnapshot; html?: string; error?: string };

function idFor(prefix: string, raw: string) {
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 33) ^ raw.charCodeAt(i);
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function askExtension(type: "snapshot" | "write" | "fetch", payload: Record<string, unknown> = {}): Promise<BridgeResponse | null> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => { window.removeEventListener("message", onMessage); resolve(null); }, REQUEST_TIMEOUT);
    function onMessage(event: MessageEvent<BridgeResponse>) {
      const data = event.data;
      if (event.source !== window || data?.channel !== CHANNEL || data.requestId !== requestId) return;
      window.clearTimeout(timer); window.removeEventListener("message", onMessage); resolve(data);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ channel: CHANNEL, source: "masar-web", type, requestId, ...payload }, window.location.origin);
  });
}

export async function getExtensionSnapshot() {
  const response = await askExtension("snapshot");
  return response?.ok && response.data ? response.data : null;
}

export async function fetchHtmlThroughExtension(url: string) {
  const response = await askExtension("fetch", { url });
  if (!response?.ok || !response.html) throw new Error(response?.error || "تعذّر الوصول إلى الإضافة");
  return response.html;
}

export async function pushBundleToExtension(bundle: ExportBundle) {
  const response = await askExtension("write", { data: bundleToExtensionSnapshot(bundle) });
  return Boolean(response?.ok);
}

function safeProgress(value: unknown) { return Math.max(0, Math.min(100, Number(value) || 0)); }

export function extensionSnapshotToBundle(data: ExtensionSnapshot, fallbackSettings: ReaderSettings): ExportBundle {
  const bookmarks = (data.reader_bookmarks && typeof data.reader_bookmarks === "object" ? data.reader_bookmarks : {}) as Record<string, Record<string, unknown>>;
  const now = Date.now();
  const articles: Article[] = Object.entries(bookmarks).map(([url, item]) => {
    const text = typeof item.text === "string" ? cleanHtml(item.text, url) : "";
    const title = typeof item.title === "string" && item.title.trim() ? item.title : url;
    const updatedAt = toEpochMillis(item.ts ?? item.updatedAt ?? item.lastOpenedAt, now);
    const savedAt = toEpochMillis(item.savedAt ?? item.createdAt ?? item.created, updatedAt);
    return { id: idFor("ext_article", url), url, title, content: text, excerpt: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180), image: typeof item.image === "string" ? item.image : undefined, tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [], folderId: typeof item.folderId === "string" ? item.folderId : undefined, savedAt, updatedAt, contentUpdatedAt: text ? updatedAt : undefined, contentVersion: text ? 0 : undefined, lastOpenedAt: toEpochMillis(item.lastOpenedAt, 0) || undefined, progress: safeProgress(item.progress ?? item.scroll), isRead: Boolean(item.read), isArchived: Boolean(item.archived), isFavorite: Boolean(item.important), readingTimeMinutes: Number(item.readingTimeMinutes) || 0, sourceStatus: text ? "cached" : "link-only" };
  });
  const byUrl = new Map(articles.map((article) => [article.url, article.id]));
  const rawNotes = Array.isArray(data.reader_notes) ? data.reader_notes as Record<string, unknown>[] : [];
  const notes: Note[] = rawNotes.map((note, index) => { const url = typeof note.url === "string" ? note.url : undefined; return { id: String(note.id || idFor("ext_note", `${url || ""}_${index}_${note.created || now}`)), articleId: url ? byUrl.get(url) : undefined, url, quote: typeof note.quote === "string" ? note.quote : undefined, content: typeof note.content === "string" ? note.content : "", isRtl: Boolean(note.isRTL), createdAt: Number(note.created) || now, updatedAt: Number(note.lastModified || note.created) || now }; });
  const rawHighlights = (data.reader_highlights && typeof data.reader_highlights === "object" ? data.reader_highlights : {}) as Record<string, Record<string, unknown>[]>;
  const highlights: Highlight[] = Object.entries(rawHighlights).flatMap(([url, list]) => (Array.isArray(list) ? list : []).map((item, index) => ({ id: String(item.id || idFor("ext_highlight", `${url}_${index}_${item.text || ""}`)), articleId: byUrl.get(url) || idFor("ext_article", url), quote: typeof item.text === "string" ? item.text : "", prefix: typeof item.context === "string" ? item.context : undefined, createdAt: Number(item.created) || now }))).filter((item) => Boolean(item.quote));
  const folders = Array.isArray(data.reader_folders) ? data.reader_folders.filter((folder): folder is { id: string; name: string; createdAt?: number } => Boolean(folder && typeof folder === "object" && typeof (folder as { name?: unknown }).name === "string")).map((folder) => ({ id: String(folder.id || idFor("ext_folder", folder.name)), name: folder.name, createdAt: Number(folder.createdAt) || now })) : [];
  const themeValues: ReaderSettings["theme"][] = ["light", "cream", "sepia", "dark"];
  const libraryBackground: ReaderSettings["libraryBackground"] = data.library_bg_color === "sand" || data.library_bg_color === "mist" ? data.library_bg_color : fallbackSettings.libraryBackground;
  const textAlign: ReaderSettings["textAlign"] = data.reader_align === "left" || data.reader_align === "justify" || data.reader_align === "right" ? data.reader_align : fallbackSettings.textAlign;
  const autoOpenSites = Array.isArray(data.reader_auto_open_sites) ? data.reader_auto_open_sites.filter((item): item is string => typeof item === "string") : fallbackSettings.autoOpenSites;
  const importantSites = Array.isArray(data.reader_important_sites) ? data.reader_important_sites.filter((item): item is { domain: string; checked?: boolean } => Boolean(item && typeof item === "object" && typeof (item as { domain?: unknown }).domain === "string")).map((item) => ({ domain: item.domain, checked: item.checked !== false })) : fallbackSettings.importantSites;
  const settings: ReaderSettings = { ...fallbackSettings, fontSize: Number(data.reader_font_size) || fallbackSettings.fontSize, lineHeight: Number(data.reader_line_height) || fallbackSettings.lineHeight, wordSpacing: Number(data.reader_word_spacing) || fallbackSettings.wordSpacing, width: Number(data.reader_width) || fallbackSettings.width, fontFamily: data.reader_font === "sans" || data.reader_font === "mono" ? data.reader_font : fallbackSettings.fontFamily, textAlign, theme: themeValues[Number(data.reader_theme)] || fallbackSettings.theme, isRtl: typeof data.reader_rtl === "boolean" ? data.reader_rtl : fallbackSettings.isRtl, showImages: typeof data.reader_show_photos === "boolean" ? data.reader_show_photos : fallbackSettings.showImages, libraryBackground, autoOpenEnabled: typeof data.reader_auto_open_enabled === "boolean" ? data.reader_auto_open_enabled : fallbackSettings.autoOpenEnabled, autoOpenSites, importantSites };
  return { version: 1, exportedAt: now, articles, folders, notes, highlights, settings };
}

export function mergeExtensionBundle(local: ExportBundle, extension: ExportBundle): ExportBundle {
  const byUrl = new Map(local.articles.map((article) => [article.url, article]));
  extension.articles.forEach((remote) => {
    const current = byUrl.get(remote.url);
    if (!current || remote.updatedAt > current.updatedAt || (!current.content && remote.content)) {
      const earliestSavedAt = current ? Math.min(savedAtOf(current), savedAtOf(remote)) : savedAtOf(remote);
      const remoteHasContent = Boolean(remote.content.trim());
      byUrl.set(remote.url, {
        ...remote,
        id: current?.id || remote.id,
        savedAt: earliestSavedAt,
        title: remote.title && remote.title !== remote.url ? remote.title : current?.title || remote.title,
        excerpt: remoteHasContent ? remote.excerpt : current?.excerpt || remote.excerpt,
        content: remoteHasContent ? remote.content : current?.content || "",
        image: remote.image || current?.image,
        contentUpdatedAt: remoteHasContent ? remote.contentUpdatedAt : current?.contentUpdatedAt,
        contentVersion: remoteHasContent ? remote.contentVersion : current?.contentVersion,
        sourceStatus: remoteHasContent ? remote.sourceStatus : current?.sourceStatus || remote.sourceStatus,
        tags: remote.tags.length ? remote.tags : current?.tags || [],
        folderId: remote.folderId || current?.folderId,
      });
    }
  });
  const folders = [...local.folders]; extension.folders.forEach((item) => { if (!folders.some((folder) => folder.id === item.id || folder.name === item.name)) folders.push(item); });
  const notes = [...local.notes]; extension.notes.forEach((item) => { if (!notes.some((note) => note.url === item.url && note.content === item.content && note.quote === item.quote)) notes.push(item); });
  const highlights = [...local.highlights]; extension.highlights.forEach((item) => { if (!highlights.some((highlight) => highlight.articleId === item.articleId && highlight.quote === item.quote)) highlights.push(item); });
  return { version: 1, exportedAt: Date.now(), articles: Array.from(byUrl.values()), folders, notes, highlights, settings: extension.articles.length ? extension.settings : local.settings };
}

export function bundleToExtensionSnapshot(bundle: ExportBundle): ExtensionSnapshot {
  const bookmarks: Record<string, unknown> = {}; const articleById = new Map(bundle.articles.map((article) => [article.id, article]));
  bundle.articles.forEach((article) => { bookmarks[article.url] = { title: article.title, text: article.content, image: article.image, tags: article.tags, folderId: article.folderId, savedAt: savedAtOf(article), ts: article.updatedAt, scroll: article.progress, read: article.isRead, archived: article.isArchived, important: article.isFavorite, readingTimeMinutes: article.readingTimeMinutes, lastOpenedAt: article.lastOpenedAt }; });
  const highlightMap: Record<string, unknown[]> = {}; bundle.highlights.forEach((highlight) => { const url = articleById.get(highlight.articleId)?.url; if (!url) return; (highlightMap[url] ||= []).push({ id: highlight.id, text: highlight.quote, context: highlight.prefix || "", created: highlight.createdAt, lastModified: highlight.createdAt }); });
  return { reader_bookmarks: bookmarks, reader_folders: bundle.folders, reader_notes: bundle.notes.map((note) => ({ id: note.id, url: note.url || articleById.get(note.articleId || "")?.url, domain: note.url ? new URL(note.url).hostname : "", content: note.content, isRTL: note.isRtl, quote: note.quote, created: note.createdAt, lastModified: note.updatedAt })), reader_highlights: highlightMap, reader_theme: ["light", "cream", "sepia", "dark"].indexOf(bundle.settings.theme), reader_font_size: bundle.settings.fontSize, reader_font: bundle.settings.fontFamily, reader_align: bundle.settings.textAlign, reader_width: bundle.settings.width, reader_line_height: bundle.settings.lineHeight, reader_word_spacing: bundle.settings.wordSpacing, reader_rtl: bundle.settings.isRtl, reader_show_photos: bundle.settings.showImages, library_bg_color: bundle.settings.libraryBackground, reader_auto_open_enabled: bundle.settings.autoOpenEnabled, reader_auto_open_sites: bundle.settings.autoOpenSites, reader_important_sites: bundle.settings.importantSites };
}

export function hasExtensionReaderData(data: ExtensionSnapshot) { return Object.keys(data).some((key) => SYNC_KEYS.includes(key) && Boolean(data[key])); }

export { defaultReaderSettings };
