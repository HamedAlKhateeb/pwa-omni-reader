/**
 * Design reminder — «مرسم التصفّح»: IndexedDB is the primary source of truth.
 * Network access is optional; records remain usable while offline.
 */
import type { Article, ExportBundle, Folder, Highlight, Note, ReaderSettings } from "./types";
import { defaultReaderSettings } from "./types";

const DB_NAME = "omni-reader-local";
const DB_VERSION = 1;
const STORES = ["articles", "folders", "notes", "highlights", "settings"] as const;
type StoreName = (typeof STORES)[number];
const ARTICLE_DELETION_LOG_KEY = "reader_deleted";

export type ArticleDeletionLog = Record<string, number>;

function normalizeDeletionLog(value: unknown): ArticleDeletionLog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([url, timestamp]) => [url, Number(timestamp) || 0] as const)
    .filter(([url, timestamp]) => Boolean(url) && timestamp > 0));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("articles")) {
        const articles = db.createObjectStore("articles", { keyPath: "id" });
        articles.createIndex("savedAt", "savedAt");
        articles.createIndex("url", "url", { unique: false });
      }
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("notes")) {
        const notes = db.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("articleId", "articleId", { unique: false });
      }
      if (!db.objectStoreNames.contains("highlights")) {
        const highlights = db.createObjectStore("highlights", { keyPath: "id" });
        highlights.createIndex("articleId", "articleId", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function remove(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clear(store: StoreName): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getArticleDeletionLog(): Promise<ArticleDeletionLog> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("settings", "readonly").objectStore("settings").get(ARTICLE_DELETION_LOG_KEY);
    request.onsuccess = () => resolve(normalizeDeletionLog(request.result?.value));
    request.onerror = () => reject(request.error);
  });
}

async function setArticleDeletionLog(value: ArticleDeletionLog): Promise<void> {
  await put("settings", { key: ARTICLE_DELETION_LOG_KEY, value: normalizeDeletionLog(value) });
}

export const localStore = {
  getArticles: () => getAll<Article>("articles"),
  saveArticle: (article: Article) => put("articles", article),
  deleteArticle: (id: string) => remove("articles", id),
  getFolders: () => getAll<Folder>("folders"),
  saveFolder: (folder: Folder) => put("folders", folder),
  deleteFolder: (id: string) => remove("folders", id),
  getNotes: () => getAll<Note>("notes"),
  saveNote: (note: Note) => put("notes", note),
  deleteNote: (id: string) => remove("notes", id),
  getHighlights: () => getAll<Highlight>("highlights"),
  saveHighlight: (highlight: Highlight) => put("highlights", highlight),
  deleteHighlight: (id: string) => remove("highlights", id),
  async getSettings(): Promise<ReaderSettings> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction("settings", "readonly").objectStore("settings").get("reader");
      request.onsuccess = () => resolve({ ...defaultReaderSettings, ...(request.result?.value ?? {}) });
      request.onerror = () => reject(request.error);
    });
  },
  saveSettings: (settings: ReaderSettings) => put("settings", { key: "reader", value: settings }),
  getArticleDeletionLog,
  setArticleDeletionLog,
  async recordArticleDeletion(url: string, timestamp = Date.now()) {
    if (!url) return;
    const current = await getArticleDeletionLog();
    const next = { ...current, [url]: Math.max(current[url] || 0, timestamp) };
    const limited = Object.fromEntries(Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, 500));
    await setArticleDeletionLog(limited);
  },
  async applyArticleDeletions(deletions: ArticleDeletionLog) {
    const normalized = normalizeDeletionLog(deletions);
    if (!Object.keys(normalized).length) return false;
    const [articles, notes, highlights] = await Promise.all([getAll<Article>("articles"), getAll<Note>("notes"), getAll<Highlight>("highlights")]);
    const removedArticles = articles.filter((article) => (normalized[article.url] || 0) >= Math.max(article.updatedAt || 0, article.savedAt || 0));
    if (!removedArticles.length) return false;
    const articleIds = new Set(removedArticles.map((article) => article.id));
    await Promise.all([
      ...removedArticles.map((article) => remove("articles", article.id)),
      ...notes.filter((note) => note.articleId && articleIds.has(note.articleId)).map((note) => remove("notes", note.id)),
      ...highlights.filter((highlight) => articleIds.has(highlight.articleId)).map((highlight) => remove("highlights", highlight.id)),
    ]);
    return true;
  },
  async exportAll(): Promise<ExportBundle> {
    const [articles, folders, notes, highlights, settings] = await Promise.all([
      getAll<Article>("articles"), getAll<Folder>("folders"), getAll<Note>("notes"), getAll<Highlight>("highlights"), this.getSettings(),
    ]);
    return { version: 1, exportedAt: Date.now(), articles, folders, notes, highlights, settings };
  },
  async importAll(bundle: ExportBundle): Promise<void> {
    const deletionLog = await getArticleDeletionLog();
    const db = await openDb();
    const transaction = db.transaction(STORES, "readwrite");
    for (const store of STORES) transaction.objectStore(store).clear();
    bundle.articles.forEach((item) => transaction.objectStore("articles").put(item));
    bundle.folders.forEach((item) => transaction.objectStore("folders").put(item));
    bundle.notes.forEach((item) => transaction.objectStore("notes").put(item));
    bundle.highlights.forEach((item) => transaction.objectStore("highlights").put(item));
    transaction.objectStore("settings").put({ key: "reader", value: bundle.settings });
    if (Object.keys(deletionLog).length) transaction.objectStore("settings").put({ key: ARTICLE_DELETION_LOG_KEY, value: deletionLog });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },
  async clearEverything() {
    await Promise.all(STORES.map((store) => clear(store)));
  },
};
