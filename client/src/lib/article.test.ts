// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createArticle, extractArticleFromHtml, isBrokenArticleContent, newestSavedFirst, sortArticlesBySavedAt, toEpochMillis } from "./article";

describe("extractArticleFromHtml", () => {
  it("uses Mozilla Readability to isolate article text and remove active markup", () => {
    const html = `<!doctype html><html><head><title>عنوان احتياطي</title><meta property="og:image" content="https://cdn.example.test/cover.jpg"></head><body><nav>تنقل</nav><article><h1>مقال للاختبار</h1><p>هذا نص تجريبي طويل يشرح فكرة المقال بصورة واضحة ومتماسكة.</p><p>${"يحتوي المقال على فقرة قابلة للقراءة تساعد Readability على عزل المحتوى الأساسي عن التنقل والإعلانات. ".repeat(8)}</p><script>window.__unsafe = true</script></article><aside>إعلان</aside></body></html>`;
    const article = extractArticleFromHtml(html, "https://example.test/readability-check");
    expect(article.title).toBe("مقال للاختبار");
    expect(article.content).toContain("Readability");
    expect(article.content).not.toContain("window.__unsafe");
    expect(article.content).not.toContain("<nav");
    expect(article.sourceStatus).toBe("cached");
    expect(article.image).toBe("https://cdn.example.test/cover.jpg");
  });

  it("does not store an unrendered Vue template as readable article content", () => {
    const template = "<h1>{{vm.title}}</h1><p>{{vm.content}}</p>";
    const article = createArticle("https://example.test/dynamic", "قالب", template);
    expect(isBrokenArticleContent(template)).toBe(true);
    expect(article.content).toBe("");
    expect(article.sourceStatus).toBe("link-only");
  });

  it("orders by the original save date even when an old extension timestamp is in seconds", () => {
    const oldExtensionArticle = { id: "old", savedAt: 1_700_000_000, updatedAt: 1_800_000_000_000 };
    const newerCloudArticle = { id: "new", savedAt: 1_750_000_000_000, updatedAt: 1_750_000_000_000 };
    expect(toEpochMillis(oldExtensionArticle.savedAt)).toBe(1_700_000_000_000);
    expect([oldExtensionArticle, newerCloudArticle].sort(newestSavedFirst).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("orders local, extension, and cloud articles by savedAt regardless of arrival order", () => {
    const byArrivalOrder = [
      { id: "cloud", savedAt: 1_720_000_000_000, updatedAt: 1_800_000_000_000 },
      { id: "extension", savedAt: 1_700_000_000, updatedAt: 1_710_000_000_000 },
      { id: "local", savedAt: 1_750_000_000_000, updatedAt: 1_750_000_000_000 },
    ];
    expect(sortArticlesBySavedAt(byArrivalOrder).map((item) => item.id)).toEqual(["local", "cloud", "extension"]);
  });
});
