import { describe, expect, it } from "vitest";
import { mergeArticleDeletionLogs, smartMerge } from "./supabaseSync";

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
});
