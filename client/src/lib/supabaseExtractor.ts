export type RemoteExtractedArticle = {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  image?: string;
  readingTimeMinutes: number;
};

export const isGitHubPagesBuild = import.meta.env.VITE_GITHUB_PAGES === "true";

export async function extractWithSupabase(url: string): Promise<RemoteExtractedArticle> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !publishableKey) throw new Error("لم تُضبط خدمة الاستخراج بعد. أضف إعدادات Supabase إلى أسرار GitHub Pages ثم أعد النشر.");
  const response = await fetch(`${baseUrl}/functions/v1/extract-article`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json().catch(() => null) as RemoteExtractedArticle & { error?: string } | null;
  if (!response.ok || !payload?.content) throw new Error(payload?.error || "تعذّر استخراج المقال.");
  return payload;
}
