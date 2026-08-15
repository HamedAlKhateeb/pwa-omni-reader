import { bundleToExtensionSnapshot, extensionSnapshotToBundle, mergeExtensionBundle } from "./extensionBridge";
import { localStore, type ArticleDeletionLog } from "./storage";
import { cleanHtml } from "./article";
import { extractWithRemoteServer, type RemoteExtractedArticle } from "./remoteExtractor";
import type { Article, ExportBundle, ReaderSettings } from "./types";

export const SYNC_KEYS = [
  "reader_bookmarks", "reader_folders", "reader_notes", "reader_highlights",
  "reader_custom_rules", "reader_important_sites", "reader_auto_open_sites",
  "reader_auto_open_enabled", "reader_positions", "reader_theme", "reader_font_size",
  "reader_font", "reader_align", "reader_width", "reader_line_height",
  "reader_word_spacing", "reader_rtl", "reader_show_photos", "library_bg_color",
  "reader_deleted",
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];
type SyncValues = Partial<Record<SyncKey, unknown>>;
type RemoteEntry = { value: unknown; updatedAt: string };
type RemoteData = Record<string, RemoteEntry>;

type ArticleContentPayload = {
  url: string;
  content: string;
  contentUpdatedAt: number;
};

const ARTICLE_CONTENT_PREFIX = "reader_article_content:";
const MAX_ARTICLE_CONTENT_BYTES = 180_000;
const MAX_ARTICLE_CONTENTS_PER_SYNC = 12;

export type SyncSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  expiresAt?: number;
};

export type SyncConflict = {
  key: SyncKey;
  localValue: unknown;
  serverValue: unknown;
  localUpdatedAt: number;
  serverUpdatedAt: string;
};

export type SyncResult = { ok: boolean; error?: string; conflicts: SyncConflict[]; syncedAt?: number };

type SyncMeta = {
  lastSyncAt: number;
  lastValues: Partial<Record<SyncKey, string>>;
  passthrough: Partial<Record<SyncKey, unknown>>;
};

const SESSION_STORAGE_KEY = "masar.supabase.session";
const META_STORAGE_KEY = "masar.supabase.sync-meta";
const syncConfig = {
  url: String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""),
  anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || ""),
};

function getConfig() {
  return syncConfig.url.startsWith("https://") && syncConfig.anonKey ? syncConfig : null;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStored<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getMeta(): SyncMeta {
  return readStored<SyncMeta>(META_STORAGE_KEY, { lastSyncAt: 0, lastValues: {}, passthrough: {} });
}

function setMeta(meta: SyncMeta) {
  writeStored(META_STORAGE_KEY, meta);
}

function headers(token?: string) {
  const config = getConfig();
  if (!config) throw new Error("إعدادات Supabase العامة غير مكتملة.");
  return {
    "Content-Type": "application/json",
    apikey: config.anonKey,
    Authorization: `Bearer ${token || config.anonKey}`,
  };
}

async function request(path: string, init: RequestInit = {}, token?: string) {
  const config = getConfig();
  if (!config) throw new Error("إعدادات Supabase العامة غير مكتملة.");
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, body };
}

function readAuthError(body: Record<string, unknown> | null, fallback: string) {
  return String(body?.error_description || body?.msg || body?.error || body?.message || fallback);
}

function sessionFromPayload(payload: Record<string, unknown>, emailFallback: string): SyncSession | null {
  const user = payload.user as { id?: unknown; email?: unknown } | undefined;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  const userId = typeof user?.id === "string" ? user.id : "";
  if (!accessToken || !refreshToken || !userId) return null;
  return {
    accessToken,
    refreshToken,
    userId,
    email: typeof user?.email === "string" ? user.email : emailFallback,
    expiresAt: typeof payload.expires_at === "number" ? payload.expires_at * 1000 : undefined,
  };
}

export function getSession(): SyncSession | null {
  return readStored<SyncSession | null>(SESSION_STORAGE_KEY, null);
}

function setSession(session: SyncSession | null) {
  if (!session) window.localStorage.removeItem(SESSION_STORAGE_KEY);
  else writeStored(SESSION_STORAGE_KEY, session);
}

export async function signIn(email: string, password: string) {
  const { response, body } = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok || !body) throw new Error(readAuthError(body, "تعذّر تسجيل الدخول."));
  const session = sessionFromPayload(body, email);
  if (!session) throw new Error("لم تُعد خدمة الحساب جلسة صالحة.");
  setSession(session);
  return session;
}

export async function signUp(email: string, password: string) {
  const { response, body } = await request("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok || !body) throw new Error(readAuthError(body, "تعذّر إنشاء الحساب."));
  const session = sessionFromPayload(body, email);
  if (session) setSession(session);
  return { session, confirmationRequired: !session };
}

export async function recoverPassword(email: string) {
  const redirectTo = buildPasswordRecoveryRedirectUrl(window.location.origin, import.meta.env.BASE_URL);
  const { response, body } = await request("/auth/v1/recover", {
    method: "POST",
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
  if (!response.ok) throw new Error(readAuthError(body, "تعذّر إرسال رسالة استعادة كلمة المرور."));
}

export function buildPasswordRecoveryRedirectUrl(origin: string, basePath: string) {
  const target = new URL(basePath, origin);
  target.searchParams.set("reset-password", "1");
  return target.toString();
}

function recoverySessionFromHash(hash: string): SyncSession | null {
  const values = new URLSearchParams(hash.replace(/^#/, ""));
  if (values.get("type") !== "recovery") return null;
  const accessToken = values.get("access_token") || "";
  const refreshToken = values.get("refresh_token") || "";
  if (!accessToken || !refreshToken) return null;
  try {
    const encodedPayload = accessToken.split(".")[1];
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown; email?: unknown; exp?: unknown };
    if (typeof payload.sub !== "string") return null;
    return { accessToken, refreshToken, userId: payload.sub, email: typeof payload.email === "string" ? payload.email : "", expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : undefined };
  } catch {
    return null;
  }
}

export function completePasswordRecoveryFromUrl() {
  const session = recoverySessionFromHash(window.location.hash);
  if (!session) return null;
  setSession(session);
  history.replaceState({}, document.title, new URL(import.meta.env.BASE_URL, window.location.origin).toString());
  return session;
}

export async function updatePassword(password: string) {
  const { response, body } = await authorizedRequest("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) });
  if (!response.ok) throw new Error(readAuthError(body, "تعذّر تغيير كلمة المرور."));
}

export async function refreshToken() {
  const previous = getSession();
  if (!previous) return null;
  const { response, body } = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: previous.refreshToken }),
  });
  if (!response.ok || !body) {
    setSession(null);
    return null;
  }
  const session = sessionFromPayload(body, previous.email);
  if (!session) {
    setSession(null);
    return null;
  }
  setSession(session);
  return session;
}

export async function signOut() {
  const session = getSession();
  if (session) await request("/auth/v1/logout", { method: "POST" }, session.accessToken).catch(() => undefined);
  setSession(null);
}

async function authorizedRequest(path: string, init: RequestInit = {}) {
  let session = getSession();
  if (!session) throw new Error("سجّل الدخول أولًا للمزامنة.");
  let result = await request(path, init, session.accessToken);
  if (result.response.status !== 401) return { ...result, session };
  session = await refreshToken();
  if (!session) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  result = await request(path, init, session.accessToken);
  return { ...result, session };
}

function syncValuesFromBundle(bundle: ExportBundle, passthrough: SyncMeta["passthrough"], deletionLog: ArticleDeletionLog): SyncValues {
  const snapshot = bundleToExtensionSnapshot(bundle) as SyncValues;
  return {
    ...passthrough,
    ...snapshot,
    reader_custom_rules: passthrough.reader_custom_rules || [],
    reader_positions: passthrough.reader_positions || {},
    reader_deleted: deletionLog,
  };
}

function sanitizeForPush(key: SyncKey, value: unknown) {
  if (key !== "reader_bookmarks" || !value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, Record<string, unknown>>).map(([url, article]) => {
    const clean = { ...article };
    delete clean.text;
    if (typeof clean.image === "string" && clean.image.startsWith("data:image")) delete clean.image;
    return [url, clean];
  }));
}

function stable(value: unknown) {
  return JSON.stringify(value ?? null);
}

function newerValue(item: Record<string, unknown>) {
  return Number(item.lastModified || item.updatedAt || item.ts || item.lastOpenedAt || item.created || item.createdAt) || 0;
}

export function normalizeArticleDeletionLog(value: unknown): ArticleDeletionLog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([url, timestamp]) => [url, Number(timestamp) || 0] as const)
    .filter(([url, timestamp]) => Boolean(url) && timestamp > 0));
}

export function mergeArticleDeletionLogs(...logs: unknown[]): ArticleDeletionLog {
  return logs.reduce<ArticleDeletionLog>((merged, candidate) => {
    Object.entries(normalizeArticleDeletionLog(candidate)).forEach(([url, timestamp]) => {
      merged[url] = Math.max(merged[url] || 0, timestamp);
    });
    return merged;
  }, {});
}

export function smartMerge(key: SyncKey, localValue: unknown, serverValue: unknown, deletionLog: ArticleDeletionLog = {}) {
  if (key === "reader_deleted") return mergeArticleDeletionLogs(localValue, serverValue);
  if (localValue === undefined || localValue === null) return serverValue;
  if (serverValue === undefined || serverValue === null) return localValue;
  if (key === "reader_bookmarks") {
    const local = localValue as Record<string, Record<string, unknown>>;
    const server = serverValue as Record<string, Record<string, unknown>>;
    const merged = { ...local };
    Object.entries(server).forEach(([url, remote]) => {
      const current = merged[url];
      if (!current || newerValue(remote) > newerValue(current)) merged[url] = { ...current, ...remote, text: remote.text || current?.text, image: remote.image || current?.image };
    });
    Object.entries(merged).forEach(([url, article]) => {
      if ((deletionLog[url] || 0) >= newerValue(article)) delete merged[url];
    });
    return merged;
  }
  if (key === "reader_highlights") {
    const local = localValue as Record<string, Array<Record<string, unknown>>>;
    const server = serverValue as Record<string, Array<Record<string, unknown>>>;
    const merged: Record<string, Array<Record<string, unknown>>> = { ...local };
    Object.entries(server).forEach(([url, remoteList]) => {
      const byId = new Map((merged[url] || []).map((item) => [String(item.id), item]));
      remoteList.forEach((item) => { if (!byId.has(String(item.id))) byId.set(String(item.id), item); });
      merged[url] = Array.from(byId.values());
    });
    return merged;
  }
  if (["reader_notes", "reader_folders", "reader_custom_rules"].includes(key)) {
    if (!Array.isArray(localValue) || !Array.isArray(serverValue)) return serverValue;
    const merged = new Map(localValue.map((item) => [String((item as { id?: unknown }).id), item]));
    serverValue.forEach((remote) => {
      const id = String((remote as { id?: unknown }).id);
      const current = merged.get(id) as Record<string, unknown> | undefined;
      if (!current || newerValue(remote as Record<string, unknown>) > newerValue(current)) merged.set(id, remote);
    });
    return Array.from(merged.values());
  }
  if (key === "reader_important_sites") {
    if (!Array.isArray(localValue) || !Array.isArray(serverValue)) return serverValue;
    const byDomain = new Map(localValue.map((item) => [String((item as { domain?: unknown }).domain || item), item]));
    serverValue.forEach((item) => byDomain.set(String((item as { domain?: unknown }).domain || item), item));
    return Array.from(byDomain.values());
  }
  if (key === "reader_auto_open_sites") {
    if (!Array.isArray(localValue) || !Array.isArray(serverValue)) return serverValue;
    return Array.from(new Set([...localValue, ...serverValue].map(String)));
  }
  return serverValue;
}

export async function pushKey(key: SyncKey, value: unknown) {
  const session = getSession();
  if (!session) throw new Error("سجّل الدخول أولًا للمزامنة.");
  const payload = {
    user_id: session.userId,
    data_key: key,
    data_value: sanitizeForPush(key, value),
    updated_at: new Date().toISOString(),
  };
  const { response, body } = await authorizedRequest("/rest/v1/user_data?on_conflict=user_id,data_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(readAuthError(body, `تعذّر رفع ${key}.`));
}

function articleContentKey(url: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${ARTICLE_CONTENT_PREFIX}${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function articleContentPayload(article: Article): ArticleContentPayload | null {
  const content = article.content.trim();
  const contentUpdatedAt = Number(article.contentUpdatedAt || article.updatedAt || article.savedAt || 0);
  if (!content || !contentUpdatedAt || new TextEncoder().encode(content).byteLength > MAX_ARTICLE_CONTENT_BYTES) return null;
  return { url: article.url, content, contentUpdatedAt };
}

async function pushArticleContent(payload: ArticleContentPayload) {
  const session = getSession();
  if (!session) throw new Error("سجّل الدخول أولًا للمزامنة.");
  const dataKey = articleContentKey(payload.url);
  const { response, body } = await authorizedRequest("/rest/v1/user_data?on_conflict=user_id,data_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: session.userId, data_key: dataKey, data_value: payload, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(readAuthError(body, "تعذّر رفع محتوى المقال."));
}

function parseArticleContent(value: unknown): ArticleContentPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const url = typeof item.url === "string" ? item.url : "";
  const content = typeof item.content === "string" ? item.content : "";
  const contentUpdatedAt = Number(item.contentUpdatedAt) || 0;
  if (!url || !content || !contentUpdatedAt) return null;
  return { url, content, contentUpdatedAt };
}

function articleContentsFromRemote(remote: RemoteData) {
  return Object.entries(remote)
    .filter(([key]) => key.startsWith(ARTICLE_CONTENT_PREFIX))
    .map(([, entry]) => parseArticleContent(entry.value))
    .filter((payload): payload is ArticleContentPayload => Boolean(payload));
}

function articleContentsToPush(articles: Article[], remote: RemoteData) {
  return articles.map(articleContentPayload).filter((payload): payload is ArticleContentPayload => Boolean(payload))
    .filter((payload) => {
      const remotePayload = parseArticleContent(remote[articleContentKey(payload.url)]?.value);
      return !remotePayload || remotePayload.url !== payload.url || remotePayload.contentUpdatedAt < payload.contentUpdatedAt;
    })
    .sort((left, right) => right.contentUpdatedAt - left.contentUpdatedAt)
    .slice(0, MAX_ARTICLE_CONTENTS_PER_SYNC);
}

export async function pullAll(): Promise<RemoteData> {
  const session = getSession();
  if (!session) throw new Error("سجّل الدخول أولًا للمزامنة.");
  const { response, body } = await authorizedRequest(`/rest/v1/user_data?user_id=eq.${encodeURIComponent(session.userId)}&select=data_key,data_value,updated_at`, { method: "GET" });
  if (!response.ok || !Array.isArray(body)) throw new Error(readAuthError(body, "تعذّر تنزيل بيانات الحساب."));
  const values: RemoteData = {};
  body.forEach((row) => {
    const item = row as { data_key?: unknown; data_value?: unknown; updated_at?: unknown };
    if (typeof item.data_key === "string") values[item.data_key] = { value: item.data_value, updatedAt: typeof item.updated_at === "string" ? item.updated_at : new Date(0).toISOString() };
  });
  return values;
}

async function applyServerValues(values: SyncValues, fallbackSettings: ReaderSettings) {
  const current = await localStore.exportAll();
  const remoteBundle = extensionSnapshotToBundle(values, fallbackSettings);
  const merged = mergeExtensionBundle(current, remoteBundle);
  await localStore.importAll({ ...merged, settings: remoteBundle.settings });
}

async function applyRemoteArticleContents(remote: RemoteData, deletionLog: ArticleDeletionLog) {
  const remoteContents = articleContentsFromRemote(remote);
  if (!remoteContents.length) return 0;
  const articles = await localStore.getArticles();
  const byUrl = new Map(articles.map((article) => [article.url, article]));
  let applied = 0;
  for (const payload of remoteContents) {
    const article = byUrl.get(payload.url);
    if (!article || (deletionLog[payload.url] || 0) >= payload.contentUpdatedAt) continue;
    if (article.content.trim() && Number(article.contentUpdatedAt || 0) >= payload.contentUpdatedAt) continue;
    const content = cleanHtml(payload.content, payload.url);
    if (!content.trim()) continue;
    await localStore.saveArticle({ ...article, content, contentUpdatedAt: payload.contentUpdatedAt, updatedAt: Math.max(article.updatedAt || 0, payload.contentUpdatedAt), sourceStatus: "cached" });
    applied += 1;
  }
  return applied;
}

export function hydrateArticleFromRemote(article: Article, extracted: RemoteExtractedArticle, timestamp = Date.now()): Article {
  return {
    ...article,
    title: article.title && article.title !== article.url ? article.title : extracted.title,
    content: extracted.content,
    excerpt: extracted.excerpt || article.excerpt,
    image: article.image || extracted.image,
    readingTimeMinutes: extracted.readingTimeMinutes || article.readingTimeMinutes,
    updatedAt: Math.max(article.updatedAt || 0, timestamp),
    contentUpdatedAt: timestamp,
    sourceStatus: "cached",
  };
}

async function hydrateMissingSyncedArticles() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { hydrated: 0, failed: 0 };
  const articles = await localStore.getArticles();
  const missing = articles.filter((article) => !article.content.trim());
  let hydrated = 0;
  let failed = 0;

  // Keep the remote extractor responsive when a large extension library arrives.
  // Each batch is awaited before the next begins, while up to three URLs can run together.
  for (let offset = 0; offset < missing.length; offset += 3) {
    const batch = missing.slice(offset, offset + 3);
    const outcomes = await Promise.all(batch.map(async (article) => {
      try {
        const extracted = await extractWithRemoteServer(article.url);
        await localStore.saveArticle(hydrateArticleFromRemote(article, extracted));
        return true;
      } catch {
        return false;
      }
    }));
    hydrated += outcomes.filter(Boolean).length;
    failed += outcomes.filter((outcome) => !outcome).length;
  }
  return { hydrated, failed };
}

export async function fullSync(): Promise<SyncResult> {
  try {
    const session = getSession();
    if (!session) return { ok: false, error: "سجّل الدخول أولًا للمزامنة.", conflicts: [] };
    const [initialBundle, remote, localDeletionLog] = await Promise.all([localStore.exportAll(), pullAll(), localStore.getArticleDeletionLog()]);
    const meta = getMeta();
    const deletionLog = mergeArticleDeletionLogs(localDeletionLog, remote.reader_deleted?.value);
    const deletionLogChanged = stable(deletionLog) !== stable(localDeletionLog);
    if (deletionLogChanged) await localStore.setArticleDeletionLog(deletionLog);
    const deletedLocally = await localStore.applyArticleDeletions(deletionLog);
    const bundle = deletedLocally ? await localStore.exportAll() : initialBundle;
    const localValues = syncValuesFromBundle(bundle, meta.passthrough, deletionLog);
    const applyFromServer: SyncValues = {};
    const nextPassthrough = { ...meta.passthrough };
    const conflicts: SyncConflict[] = [];
    const pushQueue: Array<{ key: SyncKey; value: unknown }> = [];

    for (const key of SYNC_KEYS) {
      const localValue = localValues[key];
      const remoteEntry = remote[key];
      const localChanged = stable(localValue) !== meta.lastValues[key];
      if (key === "reader_deleted") {
        if (!remoteEntry || stable(localValue) !== stable(remoteEntry.value)) pushQueue.push({ key, value: localValue });
        continue;
      }
      if (!remoteEntry) {
        if (localValue !== undefined) pushQueue.push({ key, value: localValue });
        continue;
      }
      const serverChanged = new Date(remoteEntry.updatedAt).getTime() > meta.lastSyncAt;
      const collection = ["reader_bookmarks", "reader_folders", "reader_notes", "reader_highlights", "reader_custom_rules", "reader_important_sites", "reader_auto_open_sites"].includes(key);
      if (collection) {
        const merged = smartMerge(key, localValue, remoteEntry.value, deletionLog);
        applyFromServer[key] = merged;
        if (stable(merged) !== stable(remoteEntry.value)) pushQueue.push({ key, value: merged });
        continue;
      }
      if (meta.lastSyncAt && localChanged && serverChanged && stable(localValue) !== stable(remoteEntry.value)) {
        conflicts.push({ key, localValue, serverValue: remoteEntry.value, localUpdatedAt: meta.lastSyncAt, serverUpdatedAt: remoteEntry.updatedAt });
        continue;
      }
      if (serverChanged || !meta.lastSyncAt) applyFromServer[key] = remoteEntry.value;
      else if (localChanged) pushQueue.push({ key, value: localValue });
    }

    const contentUploads = articleContentsToPush(bundle.articles, remote);

    // Tombstones must arrive before bookmark updates. Otherwise a second device
    // can re-upload an old bookmark in the brief gap after the library changes.
    for (const item of [...pushQueue.filter((entry) => entry.key === "reader_deleted"), ...pushQueue.filter((entry) => entry.key !== "reader_deleted")]) await pushKey(item.key, item.value);
    for (const payload of contentUploads) await pushArticleContent(payload);
    if (Object.keys(applyFromServer).length) await applyServerValues(applyFromServer, bundle.settings);
    await applyRemoteArticleContents(remote, deletionLog);
    await hydrateMissingSyncedArticles();
    ["reader_custom_rules", "reader_positions"].forEach((key) => {
      const typedKey = key as SyncKey;
      if (applyFromServer[typedKey] !== undefined) nextPassthrough[typedKey] = applyFromServer[typedKey];
    });

    const finalBundle = await localStore.exportAll();
    const finalDeletionLog = await localStore.getArticleDeletionLog();
    const finalValues = syncValuesFromBundle(finalBundle, nextPassthrough, finalDeletionLog);
    const now = Date.now();
    setMeta({ lastSyncAt: now, lastValues: Object.fromEntries(SYNC_KEYS.map((key) => [key, stable(finalValues[key])])), passthrough: nextPassthrough });
    return { ok: true, conflicts, syncedAt: now };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذّرت المزامنة.", conflicts: [] };
  }
}

export async function resolveConflict(conflict: SyncConflict, side: "local" | "server") {
  const bundle = await localStore.exportAll();
  const meta = getMeta();
  const selected = side === "local" ? conflict.localValue : conflict.serverValue;
  if (side === "server") await applyServerValues({ [conflict.key]: selected }, bundle.settings);
  else await pushKey(conflict.key, selected);
  if (["reader_custom_rules", "reader_positions"].includes(conflict.key)) meta.passthrough[conflict.key] = selected;
  const finalBundle = await localStore.exportAll();
  const finalValues = syncValuesFromBundle(finalBundle, meta.passthrough, await localStore.getArticleDeletionLog());
  meta.lastSyncAt = Date.now();
  meta.lastValues = Object.fromEntries(SYNC_KEYS.map((key) => [key, stable(finalValues[key])]));
  setMeta(meta);
}

export function getLastSyncAt() {
  return getMeta().lastSyncAt || null;
}
