// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanHtml, CONTENT_PIPELINE_VERSION, createArticle, extractArticleFromHtml, isBrokenArticleContent, newestSavedFirst, repairStoredArticleContent, requiresContentRefresh, sortArticlesBySavedAt, toEpochMillis } from "./article";

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

  it("decodes stored HTML text and strips Word and magazine layout attributes", () => {
    const encoded = `&lt;p class=&quot;MsoNormal&quot; dir=&quot;RTL&quot; style=&quot;writing-mode:vertical-rl;line-height:250%;font-family:Al Tarikh&quot;&gt;نص عربي سليم&lt;/p&gt;`;
    const clean = cleanHtml(encoded, "https://nama-center.com/article");
    expect(clean).toContain("نص عربي سليم");
    expect(clean).toContain("<p>");
    expect(clean).not.toMatch(/&lt;|&quot;|MsoNormal|writing-mode|style=|dir=/i);
  });

  it("repairs an old encoded article and marks an unrecoverable template for re-extraction", () => {
    const encoded = { ...createArticle("https://example.test/old", "قديم"), content: "&lt;p style=&quot;writing-mode:vertical-rl&quot;&gt;نص محفوظ&lt;/p&gt;", excerpt: "قديم", sourceStatus: "cached" as const };
    const repaired = repairStoredArticleContent(encoded);
    expect(repaired).toMatchObject({ changed: true, requiresExtraction: false });
    expect(repaired.article.content).toContain("نص محفوظ");
    expect(repaired.article.content).not.toMatch(/&lt;|writing-mode|style=/i);

    const broken = repairStoredArticleContent({ ...encoded, content: "<p>{{vm.title}}</p>", excerpt: "قالب" });
    expect(broken).toMatchObject({ changed: true, requiresExtraction: true });
    expect(broken.article).toMatchObject({ content: "", sourceStatus: "link-only" });
  });

  it("يعلّم النسخة القديمة لإعادة الاستخراج ويعفي المحتوى المنشأ بالمسار الحالي", () => {
    const current = createArticle("https://example.test/current", "حالي", "<p>نص سليم</p>");
    expect(current.contentVersion).toBe(CONTENT_PIPELINE_VERSION);
    expect(requiresContentRefresh(current)).toBe(false);
    expect(requiresContentRefresh({ ...current, contentVersion: 0 })).toBe(true);
  });
});
