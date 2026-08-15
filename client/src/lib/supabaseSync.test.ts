// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { articleContentPayload, hydrateArticleFromRemote, mergeArticleDeletionLogs, mergeItemDeletionLogs, smartMerge } from "./supabaseSync";

describe("سجل حذف المقالات المتزامن", () => {
  it("يجمع سجلات الحذف ويحتفظ بأحدث وقت لكل رابط", () => {
    expect(mergeArticleDeletionLogs(
      { "https://example.com/a": 100, "https://example.com/b": 200 },
      { "https://example.com/a": 300, "https://example.com/c": 150 },
    )).toEqual({
      "https://example.com/a": 300,
      "https://example.com/b": 200,
      "https://example.com/c": 150,
    });
  });

  it("لا يعيد مقالًا من لقطة بعيدة أقدم من وقت حذفه", () => {
    const url = "https://example.com/old-article";
    const merged = smartMerge("reader_bookmarks", {}, {
      [url]: { title: "مقال قديم", ts: 1_000 },
    }, {
      [url]: 2_000,
    });

    expect(merged).toEqual({});
  });

  it("يسمح بحفظ جديد أُنشئ بعد سجل الحذف", () => {
    const url = "https://example.com/new-article";
    const merged = smartMerge("reader_bookmarks", {}, {
      [url]: { title: "مقال جديد", ts: 3_000 },
    }, {
      [url]: 2_000,
    });

    expect(merged).toEqual({
      [url]: { title: "مقال جديد", ts: 3_000 },
    });
  });

  it("يجمع سجل حذف الملاحظات والتمييزات ويمنع العناصر البعيدة القديمة من العودة", () => {
    const tombstones = mergeItemDeletionLogs({ notes: { note_1: 2_000 }, highlights: { hl_1000_a: 2_000 } }, { notes: { note_1: 2_500 }, highlights: { hl_1000_a: 2_100 } });
    expect(tombstones).toEqual({ notes: { note_1: 2_500 }, highlights: { hl_1000_a: 2_100 } });

    expect(smartMerge("reader_notes", [], [{ id: "note_1", content: "ملاحظة قديمة", created: 1_000, lastModified: 1_000 }], {}, tombstones)).toEqual([]);
    expect(smartMerge("reader_highlights", {}, { "https://example.com": [{ id: "hl_1000_a", quote: "تمييز قديم" }] }, {}, tombstones)).toEqual({});
  });

  it("يحوّل بطاقة مزامنة بلا محتوى إلى مقال مخزّن بعد الاستخراج", () => {
    const article = hydrateArticleFromRemote({
      id: "article_1",
      url: "https://example.com/article",
      title: "https://example.com/article",
      content: "",
      excerpt: "",
      tags: [],
      savedAt: 1_000,
      updatedAt: 1_000,
      progress: 0,
      isRead: false,
      isArchived: false,
      isFavorite: false,
      readingTimeMinutes: 0,
      sourceStatus: "link-only",
    }, {
      url: "https://example.com/article",
      title: "عنوان مستخرج",
      content: "<p>محتوى صالح للقراءة</p>",
      excerpt: "محتوى صالح",
      image: "https://example.com/cover.jpg",
      readingTimeMinutes: 4,
    }, 2_000);

    expect(article).toMatchObject({
      title: "عنوان مستخرج",
      content: "<p>محتوى صالح للقراءة</p>",
      sourceStatus: "cached",
      image: "https://example.com/cover.jpg",
      readingTimeMinutes: 4,
      updatedAt: 2_000,
    });
  });

  it("يبني حمولة نص كامل للمقال المحلي ولا يرسل رابطًا بلا محتوى", () => {
    const article = {
      id: "article_full",
      url: "https://example.com/full",
      title: "مقال كامل",
      content: "<p>نص محلي يُنقل إلى الجهاز الثاني.</p>",
      excerpt: "نص محلي",
      tags: [],
      savedAt: 1_000,
      updatedAt: 1_200,
      contentUpdatedAt: 1_100,
      progress: 0,
      isRead: false,
      isArchived: false,
      isFavorite: false,
      readingTimeMinutes: 1,
      sourceStatus: "cached" as const,
    };

    expect(articleContentPayload(article)).toEqual({
      url: "https://example.com/full",
      content: "<p>نص محلي يُنقل إلى الجهاز الثاني.</p>",
      contentUpdatedAt: 1_100,
    });
    expect(articleContentPayload({ ...article, content: "", sourceStatus: "link-only" })).toBeNull();
    expect(articleContentPayload({ ...article, content: "x".repeat(180_001) })).toBeNull();
  });
});
