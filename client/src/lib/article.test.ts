// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractArticleFromHtml } from "./article";

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
});
