import { afterEach, describe, expect, it, vi } from "vitest";
import { extractWithRemoteServer } from "./remoteExtractor";

describe("extractWithRemoteServer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a tRPC mutation and reads its JSON result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ result: { data: { json: { url: "https://example.com/article", title: "Article", content: "<p>Extracted content</p>", excerpt: "Extracted content", readingTimeMinutes: 1 } } } }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractWithRemoteServer("https://example.com/article")).resolves.toMatchObject({ title: "Article", readingTimeMinutes: 1 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/trpc/article.extract"), expect.objectContaining({ method: "POST", body: JSON.stringify({ 0: { json: { url: "https://example.com/article" } } }) }));
  });

  it("falls back to Reader when the extractor reports an upstream 403", async () => {
    const fallbackArticle = { url: "https://blocked.example/article", title: "Fallback Article", content: "<article><p>Readable fallback content.</p></article>", excerpt: "Readable fallback content.", readingTimeMinutes: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ error: { json: { message: "تعذّر الوصول إلى المقال (HTTP 403)." } } }]), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: fallbackArticle }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractWithRemoteServer(fallbackArticle.url)).resolves.toMatchObject({ title: "Fallback Article" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `https://r.jina.ai/${fallbackArticle.url}`, expect.objectContaining({ headers: expect.objectContaining({ "X-Engine": "browser", "X-No-Cache": "true" }) }));
  });

  it("does not send unsafe URLs to the external fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ error: { json: { message: "لا يمكن جلب عنوان غير آمن." } } }]), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractWithRemoteServer("http://localhost:3000/private")).rejects.toThrow("غير آمن");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
