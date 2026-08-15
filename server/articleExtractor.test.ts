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
    expect(article.image).toBe("https://example.test/cover.jpg");
    expect(article.readingTimeMinutes).toBeGreaterThan(0);
  });

  it("uses a social image or article image when Open Graph is unavailable", () => {
    const articleText = "A readable article paragraph for testing image discovery. ".repeat(12);
    const twitter = extractArticleFromHtml(`<!doctype html><head><meta name="twitter:image" content="/twitter-cover.webp"></head><body><article><h1>Twitter cover</h1><p>${articleText}</p></article></body>`, "https://example.test/story");
    const contentImage = extractArticleFromHtml(`<!doctype html><body><article><h1>Content cover</h1><img src="/article-cover.webp" alt=""><p>${articleText}</p></article></body>`, "https://example.test/story");
    expect(twitter.image).toBe("https://example.test/twitter-cover.webp");
    expect(contentImage.image).toBe("https://example.test/article-cover.webp");
  });
});
