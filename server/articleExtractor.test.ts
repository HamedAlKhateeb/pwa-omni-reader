import { describe, expect, it } from "vitest";
import { extractArticleFromHtml } from "./articleExtractor";

describe("extractArticleFromHtml", () => {
  it("extracts readable content and removes active markup", () => {
    const html = `<!doctype html><html><head><title>عنوان احتياطي</title><meta property="og:image" content="/cover.jpg"></head><body><nav>تنقل</nav><article><h1>عنوان المقال</h1><p>${"هذه فقرة اختبارية للمقال تساعد القارئ على معرفة الفكرة الأساسية بعيدًا عن عناصر التنقل والإعلانات. ".repeat(8)}</p><script>window.shouldNotRender = true</script></article><aside>إعلان</aside></body></html>`;
    const article = extractArticleFromHtml(html, "https://example.test/article");
    expect(article.title).toBe("عنوان المقال");
    expect(article.content).toContain("فقرة اختبارية");
    expect(article.content).not.toContain("window.shouldNotRender");
    expect(article.content).not.toContain("<nav");
    expect(article.readingTimeMinutes).toBeGreaterThan(0);
  });
});
