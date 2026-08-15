// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bundleToExtensionSnapshot, extensionSnapshotToBundle, mergeExtensionBundle, normalizeReaderWidth } from "./extensionBridge";
import { smartMerge } from "./supabaseSync";
import { defaultReaderSettings, type ExportBundle } from "./types";

const bundle: ExportBundle = {
  version: 1,
  exportedAt: 1,
  articles: [{ id: "article_1", url: "https://example.com/a", title: "مثال", excerpt: "", content: "<p>محتوى</p>", tags: [], savedAt: 1, updatedAt: 2, progress: 0, isRead: false, isArchived: false, isFavorite: false, readingTimeMinutes: 1, sourceStatus: "cached" }],
  folders: [], notes: [], highlights: [],
  settings: { ...defaultReaderSettings, wordSpacing: 2, textAlign: "justify", libraryBackground: "sand", autoOpenEnabled: true, autoOpenSites: ["example.com"], importantSites: [{ domain: "example.org", checked: true }] },
};

describe("Omni Reader sync compatibility", () => {
  it("rejects extension width values that would collapse the web reader", () => {
    expect(normalizeReaderWidth(20, defaultReaderSettings.width)).toBe(defaultReaderSettings.width);
    expect(normalizeReaderWidth(40, defaultReaderSettings.width)).toBe(defaultReaderSettings.width);
    expect(normalizeReaderWidth(520, defaultReaderSettings.width)).toBe(520);
    expect(normalizeReaderWidth(1220, defaultReaderSettings.width)).toBe(1220);
    expect(normalizeReaderWidth(2000, defaultReaderSettings.width)).toBe(defaultReaderSettings.width);
  });

  it("round-trips every PWA reader preference through the extension keys", () => {
    const snapshot = bundleToExtensionSnapshot(bundle);
    expect(snapshot.reader_word_spacing).toBe(2);
    expect(snapshot.reader_align).toBe("justify");
    expect(snapshot.library_bg_color).toBe("sand");
    expect(snapshot.reader_auto_open_enabled).toBe(true);
    const restored = extensionSnapshotToBundle(snapshot, defaultReaderSettings);
    expect(restored.settings).toMatchObject(bundle.settings);
  });

  it("keeps local article content while accepting newer cloud metadata", () => {
    const merged = smartMerge("reader_bookmarks", {
      "https://example.com/a": { title: "عنوان قديم", text: "النص المحلي", ts: 10 },
    }, {
      "https://example.com/a": { title: "عنوان أحدث", ts: 20 },
    }) as Record<string, { title: string; text: string }>;
    expect(merged["https://example.com/a"]).toEqual({ title: "عنوان أحدث", text: "النص المحلي", ts: 20 });
  });

  it("merges articles added independently on phone and laptop", () => {
    const merged = smartMerge("reader_bookmarks", {
      "https://example.com/from-phone": { title: "من الهاتف", text: "نص الهاتف", ts: 100 },
    }, {
      "https://example.com/from-laptop": { title: "من اللابتوب", ts: 200 },
    }) as Record<string, { title: string; text?: string; ts: number }>;

    expect(merged).toMatchObject({
      "https://example.com/from-phone": { title: "من الهاتف", text: "نص الهاتف", ts: 100 },
      "https://example.com/from-laptop": { title: "من اللابتوب", ts: 200 },
    });
  });

  it("preserves the earliest save date when newer cloud metadata replaces an article", () => {
    const local = { ...bundle, articles: [{ ...bundle.articles[0], savedAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 }] };
    const cloud = { ...bundle, articles: [{ ...bundle.articles[0], id: "cloud-copy", savedAt: 1_750_000_000_000, updatedAt: 1_800_000_000_000, title: "عنوان محدّث" }] };
    const merged = extensionSnapshotToBundle(bundleToExtensionSnapshot(local), defaultReaderSettings);
    const mergedWithCloud = mergeExtensionBundle(merged, cloud);
    expect(mergedWithCloud.articles[0]).toMatchObject({ title: "عنوان محدّث", savedAt: 1_700_000_000_000 });
  });

  it("preserves local content and image when a newer remote snapshot omits them", () => {
    const localArticle = { ...bundle.articles[0], image: "https://example.com/local-cover.jpg", excerpt: "ملخص محلي", updatedAt: 10_000, contentUpdatedAt: 10_000, contentVersion: 2, sourceStatus: "cached" as const };
    const remoteArticle = { ...localArticle, id: "remote-copy", title: "https://example.com/a", content: "", excerpt: "", image: undefined, updatedAt: 20_000, contentUpdatedAt: undefined, contentVersion: undefined, sourceStatus: "link-only" as const, tags: [], folderId: undefined };
    const merged = mergeExtensionBundle({ ...bundle, articles: [localArticle] }, { ...bundle, articles: [remoteArticle] });
    expect(merged.articles[0]).toMatchObject({ content: localArticle.content, image: localArticle.image, excerpt: localArticle.excerpt, contentVersion: 2, sourceStatus: "cached" });
  });

  it("normalizes encoded extension HTML before it enters the shared library", () => {
    const snapshot = {
      reader_bookmarks: {
        "https://nama-center.com/article": {
          title: "مقال عربي",
          text: "&lt;p class=&quot;MsoNormal&quot; style=&quot;writing-mode:vertical-rl&quot;&gt;نص عربي&lt;/p&gt;",
          ts: 1_750_000_000_000,
        },
      },
    };
    const parsed = extensionSnapshotToBundle(snapshot, defaultReaderSettings);
    expect(parsed.articles[0].content).toContain("<p>");
    expect(parsed.articles[0].content).toContain("نص عربي");
    expect(parsed.articles[0].content).not.toMatch(/&lt;|MsoNormal|writing-mode|style=/i);
  });
});
