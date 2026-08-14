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
});
