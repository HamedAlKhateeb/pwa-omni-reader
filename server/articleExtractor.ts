import { Readability } from "@mozilla/readability";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { JSDOM } from "jsdom";

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

class DynamicTemplateContentError extends Error {}

export function isDynamicTemplateContent(html: string) {
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return /{{\s*(?:vm|app|state|data|[\w$]+)\.[^}]+}}/i.test(html) || /\b(?:vm|app|state)\.(?:title|content|body|article)\b/i.test(plain);
}

export type ExtractedArticle = {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  image?: string;
  readingTimeMinutes: number;
};

function isBlockedIp(address: string) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || a === 169 && b === 254 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("::ffff:");
  }
  return true;
}

async function validateRemoteUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("الرابط غير صالح."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("يجب أن يبدأ الرابط بـ http أو https.");
  if (url.username || url.password || !url.hostname) throw new Error("الرابط غير مسموح.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("لا يمكن جلب عناوين داخلية.");
  const directFamily = net.isIP(host);
  if (directFamily && isBlockedIp(host)) throw new Error("لا يمكن جلب عناوين داخلية.");
  if (!directFamily) {
    let addresses: { address: string }[];
    try { addresses = await lookup(host, { all: true, verbatim: true }); } catch { throw new Error("تعذّر العثور على الموقع."); }
    if (!addresses.length || addresses.some((record) => isBlockedIp(record.address))) throw new Error("لا يمكن جلب عنوان غير آمن.");
  }
  return url;
}

async function fetchHtml(raw: string) {
  let url = await validateRemoteUrl(raw);
  for (let step = 0; step <= MAX_REDIRECTS; step += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "MasarReader/1.0 (+https://chromeapp-vfkdzams.manus.space)" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || step === MAX_REDIRECTS) throw new Error("تجاوز الموقع عدد التحويلات المسموح.");
      url = await validateRemoteUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`تعذّر الوصول إلى المقال (HTTP ${response.status}).`);
    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("هذا الرابط لا يشير إلى صفحة HTML قابلة للقراءة.");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_BYTES) throw new Error("صفحة المقال كبيرة جدًا للاستخراج.");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_BYTES) throw new Error("صفحة المقال كبيرة جدًا للاستخراج.");
    return { html, url: url.href };
  }
  throw new Error("تعذّر الوصول إلى المقال.");
}

const ALLOWED_READER_TAGS = new Set(["a", "b", "blockquote", "br", "code", "del", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p", "pre", "s", "section", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul"]);

export function cleanContent(html: string, baseUrl: string) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: baseUrl });
  const doc = dom.window.document;
  doc.querySelectorAll("script,style,iframe,object,embed,form,button,nav,aside,footer,header,link,meta,base,svg,canvas").forEach((node: Element) => node.remove());
  Array.from(doc.body.querySelectorAll("*")).forEach((node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_READER_TAGS.has(tag)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }
    const href = node.getAttribute("data-href") || node.getAttribute("href");
    const source = node.getAttribute("data-src") || node.getAttribute("data-original") || node.getAttribute("src");
    const alt = node.getAttribute("alt");
    const colspan = node.getAttribute("colspan");
    const rowspan = node.getAttribute("rowspan");
    Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
    if (tag === "a" && href) {
      try { const target = new URL(href, baseUrl); if (["http:", "https:"].includes(target.protocol)) node.setAttribute("href", target.href); } catch { /* omit invalid links */ }
    }
    if (tag === "img") {
      try { const target = source ? new URL(source, baseUrl) : null; if (target && ["http:", "https:"].includes(target.protocol)) node.setAttribute("src", target.href); else node.remove(); } catch { node.remove(); }
      if (alt?.trim()) node.setAttribute("alt", alt.trim().slice(0, 500));
    }
    if (["td", "th"].includes(tag)) {
      if (colspan && /^\d{1,2}$/.test(colspan)) node.setAttribute("colspan", colspan);
      if (rowspan && /^\d{1,2}$/.test(rowspan)) node.setAttribute("rowspan", rowspan);
    }
  });
  return doc.body.innerHTML;
}

function fallbackContent(doc: Document) {
  const root = doc.querySelector("article, [role='main'], .post-content, .entry-content, .content, .article-content, .story-body, .post-body, #main-content, .main-content") || doc.body;
  return root.innerHTML;
}

function articleImage(doc: Document, baseUrl: string) {
  const selectors = [
    "meta[property='og:image']",
    "meta[name='og:image']",
    "meta[name='twitter:image']",
    "meta[property='twitter:image']",
    "meta[itemprop='image']",
    "article img[src]",
    "[role='main'] img[src]",
    ".post-content img[src]",
    ".entry-content img[src]",
  ];
  for (const selector of selectors) {
    const node = doc.querySelector(selector) as HTMLMetaElement | HTMLImageElement | null;
    const source = node?.getAttribute("content") || node?.getAttribute("data-src") || node?.getAttribute("data-original") || node?.getAttribute("src");
    if (!source?.trim()) continue;
    try {
      const imageUrl = new URL(source.trim(), baseUrl);
      if (imageUrl.protocol === "https:" || imageUrl.protocol === "http:") return imageUrl.href;
    } catch { /* try the next candidate */ }
  }
  return undefined;
}

export function extractArticleFromHtml(html: string, sourceUrl: string): ExtractedArticle {
  const dom = new JSDOM(html, { url: sourceUrl });
  const doc = dom.window.document;
  doc.querySelectorAll("img").forEach((image: HTMLImageElement) => {
    const deferred = image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("data-lazy-src");
    if (deferred) image.setAttribute("src", deferred);
  });
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  const image = articleImage(doc, sourceUrl);
  let parsed: ReturnType<Readability["parse"]> | null = null;
  try { parsed = new Readability(doc, { charThreshold: 20, classesToPreserve: ["caption", "figure", "figcaption", "pullquote", "highlight"], keepClasses: false }).parse(); } catch { parsed = null; }
  const rawContent = parsed?.content && parsed.content.length >= 300 ? parsed.content : fallbackContent(doc);
  const content = cleanContent(rawContent, sourceUrl);
  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (isDynamicTemplateContent(content)) throw new DynamicTemplateContentError("أعادت الصفحة قالب JavaScript خامًا بدل نص المقال.");
  if (plain.length < 80) throw new Error("لم يتمكّن التطبيق من العثور على نص كافٍ داخل هذه الصفحة.");
  return { url: sourceUrl, title: h1 || parsed?.title || doc.title || new URL(sourceUrl).hostname, content, excerpt: parsed?.excerpt?.trim() || plain.slice(0, 220), image, readingTimeMinutes: Math.max(1, Math.round(plain.split(" ").filter(Boolean).length / 220)) };
}

async function extractDynamicPageWithReader(raw: string): Promise<ExtractedArticle> {
  const response = await fetch(`https://r.jina.ai/${raw}`, {
    headers: {
      Accept: "application/json",
      "X-Respond-With": "html",
      "X-Engine": "browser",
      "X-Respond-Timing": "network-idle",
      "X-Timeout": "20",
      "X-Token-Budget": "8000",
      "X-Robots-Txt": "true",
      DNT: "1",
    },
    signal: AbortSignal.timeout(28_000),
  });
  if (!response.ok) throw new Error("تعذّر الحصول على نسخة قابلة للقراءة من الصفحة الديناميكية.");
  const body = await response.json() as { data?: unknown; title?: unknown; url?: unknown };
  if (typeof body.data !== "string" || !body.data.trim()) throw new Error("لم تُعد خدمة الاستخراج محتوى صالحًا.");
  const extracted = extractArticleFromHtml(`<article>${body.data}</article>`, typeof body.url === "string" ? body.url : raw);
  return typeof body.title === "string" && body.title.trim() ? { ...extracted, title: body.title.trim() } : extracted;
}

export async function extractArticleFromUrl(raw: string) {
  const { html, url } = await fetchHtml(raw);
  try {
    return extractArticleFromHtml(html, url);
  } catch (error) {
    if (error instanceof DynamicTemplateContentError) return extractDynamicPageWithReader(url);
    throw error;
  }
}
