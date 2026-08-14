export type RemoteExtractedArticle = {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  image?: string;
  readingTimeMinutes: number;
};

export const isGitHubPagesBuild = import.meta.env.VITE_GITHUB_PAGES === "true";
const extractorUrl = import.meta.env.VITE_EXTRACTOR_URL || "https://chromeapp-vfkdzams.manus.space/api/trpc/article.extract?batch=1";

export async function extractWithRemoteServer(url: string): Promise<RemoteExtractedArticle> {
  const response = await fetch(extractorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TRPC-Source": "masar-pages" },
    body: JSON.stringify({ 0: { json: { url } } }),
  });
  const payload = await response.json().catch(() => null) as Array<{ result?: { data?: { json?: RemoteExtractedArticle } }; error?: { json?: { message?: string } } }> | null;
  const data = payload?.[0]?.result?.data?.json;
  if (!response.ok || !data?.content) throw new Error(payload?.[0]?.error?.json?.message || "تعذّر استخراج المقال.");
  return data;
}
