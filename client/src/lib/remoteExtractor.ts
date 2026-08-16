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
const readerUrl = "https://r.jina.ai/";

type ExtractorPayload = Array<{ result?: { data?: { json?: RemoteExtractedArticle } }; error?: { json?: { message?: string } } }>;

function readExtractorPayload(payload: ExtractorPayload | null) {
  return { data: payload?.[0]?.result?.data?.json, message: payload?.[0]?.error?.json?.message || "تعذّر استخراج المقال." };
}

function isUnsafeUrlError(message: string) {
  return /غير آمن|غير مسموح|عنوان(?:\s+|ـ)?داخلي|localhost|private|internal/i.test(message);
}

function shouldTryReaderFallback(message: string) {
  return /HTTP\s+(?:401|403|408|425|429|451|5\d{2})|تعذّر الوصول|تعذر الوصول|تعذّر استخراج|تعذر استخراج|network|fetch/i.test(message);
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const [a, b] = parts.map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && parts[2] === "0"))) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function canUseReaderFallback(raw: string) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false;
    if (isPrivateIpv4(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function isAntiBotPage(title: string, content: string) {
  return /are you a robot|unusual activity|access denied|verify you are human|captcha|security check|enable javascript and cookies/i.test(`${title} ${content}`);
}

async function extractWithReader(url: string): Promise<RemoteExtractedArticle> {
  const response = await fetch(`${readerUrl}${url}`, {
    headers: { Accept: "application/json", "X-Respond-With": "html" },
    signal: AbortSignal.timeout(35_000),
  });
  const payload = await response.json().catch(() => null) as { data?: { url?: string; title?: string; content?: string; html?: string; description?: string }; url?: string; title?: string; content?: string; html?: string; description?: string } | null;
  const data = payload?.data || payload;
  const content = typeof data?.html === "string" ? data.html.trim() : typeof data?.content === "string" ? data.content.trim() : "";
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  if (!response.ok || !content || isAntiBotPage(title, content)) throw new Error("تعذّرت خدمة القراءة البديلة من الوصول إلى المقال.");
  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return {
    url: typeof data?.url === "string" ? data.url : url,
    title: title || new URL(url).hostname,
    content,
    excerpt: typeof data?.description === "string" && data.description.trim() ? data.description.trim() : plain.slice(0, 220),
    readingTimeMinutes: Math.max(1, Math.round(plain.split(" ").filter(Boolean).length / 220)),
  };
}

export async function extractWithRemoteServer(url: string): Promise<RemoteExtractedArticle> {
  let directError: Error | null = null;
  try {
    const response = await fetch(extractorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TRPC-Source": "masar-pages" },
      body: JSON.stringify({ 0: { json: { url } } }),
    });
    const payload = await response.json().catch(() => null) as ExtractorPayload | null;
    const { data, message } = readExtractorPayload(payload);
    if (response.ok && data?.content) return data;
    directError = new Error(message);
  } catch (error) {
    directError = error instanceof Error ? error : new Error("تعذّر الاتصال بخادم الاستخراج.");
  }
  const message = directError.message;
  if (!canUseReaderFallback(url) || (!isUnsafeUrlError(message) && !shouldTryReaderFallback(message))) throw directError;
  try {
    return await extractWithReader(url);
  } catch {
    throw directError;
  }
}
