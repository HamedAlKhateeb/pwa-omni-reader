import { describe, expect, it } from "vitest";
import { bundleToExtensionSnapshot, extensionSnapshotToBundle } from "./extensionBridge";
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
});
