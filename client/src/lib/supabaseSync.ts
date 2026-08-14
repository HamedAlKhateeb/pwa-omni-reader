import { bundleToExtensionSnapshot, extensionSnapshotToBundle, mergeExtensionBundle } from "./extensionBridge";
import { localStore } from "./storage";
import type { ExportBundle, ReaderSettings } from "./types";

export const SYNC_KEYS = [
  "reader_bookmarks", "reader_folders", "reader_notes", "reader_highlights",
  "reader_custom_rules", "reader_important_sites", "reader_auto_open_sites",
  "reader_auto_open_enabled", "reader_positions", "reader_theme", "reader_font_size",
  "reader_font", "reader_align", "reader_width", "reader_line_height",
  "reader_word_spacing", "reader_rtl", "reader_show_photos", "library_bg_color",
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];
type SyncValues = Partial<Record<SyncKey, unknown>>;
type RemoteEntry = { value: unknown; updatedAt: string };
type RemoteData = Partial<Record<SyncKey, RemoteEntry>>;

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
  const { response, body } = await request("/auth/v1/recover", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(readAuthError(body, "تعذّر إرسال رسالة استعادة كلمة المرور."));
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

function syncValuesFromBundle(bundle: ExportBundle, passthrough: SyncMeta["passthrough"]): SyncValues {
  const snapshot = bundleToExtensionSnapshot(bundle) as SyncValues;
  return {
    ...passthrough,
    ...snapshot,
    reader_custom_rules: passthrough.reader_custom_rules || [],
    reader_positions: passthrough.reader_positions || {},
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

export function smartMerge(key: SyncKey, localValue: unknown, serverValue: unknown) {
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

export async function pullAll(): Promise<RemoteData> {
  const session = getSession();
  if (!session) throw new Error("سجّل الدخول أولًا للمزامنة.");
  const { response, body } = await authorizedRequest(`/rest/v1/user_data?user_id=eq.${encodeURIComponent(session.userId)}&select=data_key,data_value,updated_at`, { method: "GET" });
  if (!response.ok || !Array.isArray(body)) throw new Error(readAuthError(body, "تعذّر تنزيل بيانات الحساب."));
  const values: RemoteData = {};
  body.forEach((row) => {
    const item = row as { data_key?: unknown; data_value?: unknown; updated_at?: unknown };
    if (typeof item.data_key === "string" && SYNC_KEYS.includes(item.data_key as SyncKey)) {
      values[item.data_key as SyncKey] = { value: item.data_value, updatedAt: typeof item.updated_at === "string" ? item.updated_at : new Date(0).toISOString() };
    }
  });
  return values;
}

async function applyServerValues(values: SyncValues, fallbackSettings: ReaderSettings) {
  const current = await localStore.exportAll();
  const remoteBundle = extensionSnapshotToBundle(values, fallbackSettings);
  const merged = mergeExtensionBundle(current, remoteBundle);
  await localStore.importAll({ ...merged, settings: remoteBundle.settings });
}

export async function fullSync(): Promise<SyncResult> {
  try {
    const session = getSession();
    if (!session) return { ok: false, error: "سجّل الدخول أولًا للمزامنة.", conflicts: [] };
    const [bundle, remote] = await Promise.all([localStore.exportAll(), pullAll()]);
    const meta = getMeta();
    const localValues = syncValuesFromBundle(bundle, meta.passthrough);
    const applyFromServer: SyncValues = {};
    const nextPassthrough = { ...meta.passthrough };
    const conflicts: SyncConflict[] = [];
    const pushQueue: Array<{ key: SyncKey; value: unknown }> = [];

    for (const key of SYNC_KEYS) {
      const localValue = localValues[key];
      const remoteEntry = remote[key];
      const localChanged = stable(localValue) !== meta.lastValues[key];
      if (!remoteEntry) {
        if (localValue !== undefined) pushQueue.push({ key, value: localValue });
        continue;
      }
      const serverChanged = new Date(remoteEntry.updatedAt).getTime() > meta.lastSyncAt;
      const collection = ["reader_bookmarks", "reader_folders", "reader_notes", "reader_highlights", "reader_custom_rules", "reader_important_sites", "reader_auto_open_sites"].includes(key);
      if (collection) {
        const merged = smartMerge(key, localValue, remoteEntry.value);
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

    for (const item of pushQueue) await pushKey(item.key, item.value);
    if (Object.keys(applyFromServer).length) await applyServerValues(applyFromServer, bundle.settings);
    ["reader_custom_rules", "reader_positions"].forEach((key) => {
      const typedKey = key as SyncKey;
      if (applyFromServer[typedKey] !== undefined) nextPassthrough[typedKey] = applyFromServer[typedKey];
    });

    const finalBundle = await localStore.exportAll();
    const finalValues = syncValuesFromBundle(finalBundle, nextPassthrough);
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
  const finalValues = syncValuesFromBundle(finalBundle, meta.passthrough);
  meta.lastSyncAt = Date.now();
  meta.lastValues = Object.fromEntries(SYNC_KEYS.map((key) => [key, stable(finalValues[key])]));
  setMeta(meta);
}

export function getLastSyncAt() {
  return getMeta().lastSyncAt || null;
}
