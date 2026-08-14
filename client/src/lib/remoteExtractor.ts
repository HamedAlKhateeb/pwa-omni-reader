export type RemoteExtractedArticle = {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  image?: string;
  readingTimeMinutes: number;
};

export const isGitHubPagesBuild = import.meta.env.VITE_GITHUB_PAGES === "true";
const extractorUrl = import.meta.env.VITE_EXTRACTOR_URL || "https://chromeapp-vfkdzams.manus.space/api/extract";

export async function extractWithRemoteServer(url: string): Promise<RemoteExtractedArticle> {
  const response = await fetch(extractorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json().catch(() => null) as RemoteExtractedArticle & { error?: string } | null;
  if (!response.ok || !payload?.content) throw new Error(payload?.error || "تعذّر استخراج المقال.");
  return payload;
}
