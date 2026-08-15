// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localStore } from "./storage";
import { defaultReaderSettings, type Article, type ExportBundle } from "./types";

type Device = { articles: Article[] };
type CloudRow = { user_id: string; data_key: string; data_value: unknown; updated_at: string };

const article: Article = {
  id: "article_laptop",
  url: "https://example.test/full-text",
  title: "مقال اللابتوب",
  content: "<p>هذا النص الكامل يجب أن يصل إلى الهاتف كما حُفظ على اللابتوب.</p>",
  excerpt: "نص كامل",
  tags: [],
  savedAt: 10,
  updatedAt: 20,
  contentUpdatedAt: 20,
  progress: 0,
  isRead: false,
  isArchived: false,
  isFavorite: false,
  readingTimeMinutes: 1,
  sourceStatus: "cached",
};

function bundle(device: Device): ExportBundle {
  return { version: 1, exportedAt: Date.now(), articles: structuredClone(device.articles), folders: [], notes: [], highlights: [], settings: defaultReaderSettings };
}

function attachDevice(device: Device) {
  vi.spyOn(localStore, "exportAll").mockImplementation(async () => bundle(device));
  vi.spyOn(localStore, "getArticles").mockImplementation(async () => structuredClone(device.articles));
  vi.spyOn(localStore, "saveArticle").mockImplementation(async (next) => { const index = device.articles.findIndex((item) => item.id === next.id); if (index >= 0) device.articles[index] = structuredClone(next); else device.articles.push(structuredClone(next)); });
  vi.spyOn(localStore, "importAll").mockImplementation(async (next) => { device.articles = structuredClone(next.articles); });
  vi.spyOn(localStore, "getArticleDeletionLog").mockResolvedValue({});
  vi.spyOn(localStore, "setArticleDeletionLog").mockResolvedValue();
  vi.spyOn(localStore, "applyArticleDeletions").mockResolvedValue(false);
}

describe("مزامنة النص الكامل بين جهازين", () => {
  const cloud = new Map<string, CloudRow>();

  beforeEach(async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://sync.example.test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-anon-key");
    window.localStorage.clear();
    window.localStorage.setItem("masar.supabase.session", JSON.stringify({ accessToken: "token", refreshToken: "refresh", userId: "user_1", email: "reader@example.test" }));
    cloud.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method || "GET") === "GET") {
        return new Response(JSON.stringify(Array.from(cloud.values()).filter((row) => row.user_id === "user_1")), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const body = JSON.parse(String(init?.body || "{}")) as CloudRow;
      cloud.set(body.data_key, { ...body, updated_at: new Date().toISOString() });
      return new Response("", { status: 201, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ينقل النص الكامل من اللابتوب إلى الهاتف بعد دورة رفع وسحب كاملة", async () => {
    const { fullSync } = await import("./supabaseSync");
    const laptop: Device = { articles: [structuredClone(article)] };
    attachDevice(laptop);
    expect((await fullSync()).ok).toBe(true);
    expect(Array.from(cloud.keys()).some((key) => key.startsWith("reader_article_content:"))).toBe(true);

    vi.restoreAllMocks();
    window.localStorage.removeItem("masar.supabase.sync-meta");
    const phone: Device = { articles: [] };
    attachDevice(phone);
    expect((await fullSync()).ok).toBe(true);
    expect(phone.articles).toHaveLength(1);
    expect(phone.articles[0].content).toBe(article.content);
    expect(phone.articles[0].sourceStatus).toBe("cached");
  });
});
