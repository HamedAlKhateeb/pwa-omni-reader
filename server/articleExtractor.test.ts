import { describe, expect, it, vi } from "vitest";
import { extractArticleFromHtml, extractArticleFromUrl, isDynamicTemplateContent } from "./articleExtractor";

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

  it("removes site-specific layout attributes while preserving readable links, images, and tables", () => {
    const text = "A readable article paragraph for testing clean reader markup. ".repeat(12);
    const article = extractArticleFromHtml(`<!doctype html><body><article><h1>Clean reader</h1><div id="site-shell" class="theme-card" data-layout="wide" style="display:grid"><p>${text}</p><a href="/related" onclick="alert(1)">Related</a><img src="/cover.webp" width="999" style="float:left" alt="Cover"><table class="wide" style="width:1500px"><tr><th colspan="2">Header</th></tr><tr><td>One</td><td>Two</td></tr></table></div></article></body>`, "https://example.test/story");

    expect(article.content).not.toMatch(/\b(id|class|style|data-layout|onclick|width)=/i);
    expect(article.content).toContain('href="https://example.test/related"');
    expect(article.content).toContain('src="https://example.test/cover.webp"');
    expect(article.content).toContain('colspan="2"');
  });

  it("rejects a Vue template before it becomes a broken reader article", () => {
    const template = `<article><h1>{{vm.title}}</h1><p>{{vm.content}}</p><p>${"placeholder ".repeat(20)}</p></article>`;
    expect(isDynamicTemplateContent(template)).toBe(true);
    expect(() => extractArticleFromHtml(template, "https://example.test/dynamic")).toThrow("قالب JavaScript خام");
  });

  it("decodes textified Word HTML before cleaning the readable article", () => {
    const encoded = `&lt;p class=&quot;MsoNormal&quot; dir=&quot;RTL&quot; style=&quot;writing-mode:vertical-rl&quot;&gt;${"هذا نص عربي صالح للقراءة بعد فك الترميز. ".repeat(8)}&lt;/p&gt;`;
    const article = extractArticleFromHtml(`<html><body><article>${encoded}</article></body></html>`, "https://example.test/arabic");
    expect(article.content).toContain("هذا نص عربي صالح");
    expect(article.content).not.toMatch(/&lt;|&quot;|MsoNormal|writing-mode|style=|dir=/i);
  });

  it("يحافظ على فصل النص الخام المفصول بأسطر ويحفظ الصورة المؤجلة", () => {
    const first = "هذه فقرة عربية طويلة في نص خام، يجب أن تبقى فقرة قابلة للقراءة بعد الاستخراج حتى إن لم تستخدم الصفحة وسم الفقرة المعتاد. ".repeat(3);
    const second = "وهذه فقرة ثانية مستقلة تساعد على التحقق من أن الفصل بين الأسطر لا يحوّل المقال إلى نص متصل أو تخطيط عمودي مشوّه. ".repeat(3);
    const article = extractArticleFromHtml(`<html><body><article><h1>مقال نصي</h1><img src="data:image/gif;base64,AA" data-src="/lazy-cover.webp">${first}<br><br>${second}</article></body></html>`, "https://example.test/raw-text");

    expect(article.content).toContain("هذه فقرة عربية طويلة");
    expect(article.content).toContain("وهذه فقرة ثانية مستقلة");
    expect(article.content).toContain('src="https://example.test/lazy-cover.webp"');
    expect(article.content).toMatch(/<p>|<br\s*\/?/i);
  });

  it("يفضّل حاوية المقال على غلاف الصفحة المليء بروابط التنقل", () => {
    const story = "هذا هو نص المقال الفعلي الذي ينبغي أن يظهر في القارئ دون قوائم الموقع وروابطه الجانبية أو عناصره الدعائية. ".repeat(6);
    const html = `<html><body><div class="content"><nav>${"<a href='/menu'>رابط قائمة طويل</a>".repeat(25)}</nav><div class="article-content"><h1>النص الفعلي</h1><p>${story}</p></div></div></body></html>`;
    const article = extractArticleFromHtml(html, "https://example.test/noise");

    expect(article.content).toContain("هذا هو نص المقال الفعلي");
    expect(article.content).not.toContain("رابط قائمة طويل");
  });

  it("uses Reader as a fallback when the source returns HTTP 403", async () => {
    const story = "This is readable fallback article content returned by the browser reader after the source denied a direct request. ".repeat(5);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: "https://example.com/blocked", title: "Blocked article", content: `<h1>Blocked article</h1><p>${story}</p>` } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractArticleFromUrl("https://example.com/blocked")).resolves.toMatchObject({ title: "Blocked article" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("does not send an unsafe local URL to any fetcher", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractArticleFromUrl("http://localhost:3000/private")).rejects.toThrow("داخلية");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("accepts the public WordPress.com IPv4 range used by YouDo", async () => {
    const story = "This is readable content from the public WordPress.com address used by YouDo. ".repeat(8);
    const fetchMock = vi.fn().mockResolvedValue(new Response(`<html><body><article><h1>YouDo article</h1><p>${story}</p></article></body></html>`, { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractArticleFromUrl("http://192.0.78.215/story")).resolves.toMatchObject({ title: "YouDo article" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("still rejects the reserved 192.0.0.0/24 range", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractArticleFromUrl("http://192.0.0.8/reserved")).rejects.toThrow("داخلية");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("accepts a public IPv4-mapped IPv6 address", async () => {
    const story = "This is readable content from a public IPv4-mapped address. ".repeat(8);
    const fetchMock = vi.fn().mockResolvedValue(new Response(`<html><body><article><h1>Mapped public host</h1><p>${story}</p></article></body></html>`, { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractArticleFromUrl("http://[::ffff:93.184.216.34]/story")).resolves.toMatchObject({ title: "Mapped public host" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
