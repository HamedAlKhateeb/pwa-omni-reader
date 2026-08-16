import { Readability } from "@mozilla/readability";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { JSDOM } from "jsdom";

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

class DynamicTemplateContentError extends Error {}
class RemoteFetchError extends Error { constructor(public readonly status: number) { super(`تعذّر الوصول إلى المقال (HTTP ${status}).`); } }

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
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || a === 169 && b === 254 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && address.split(".")[2] === "0") || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mappedIpv4) return isBlockedIp(mappedIpv4[1]);
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
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
    if (!response.ok) throw new RemoteFetchError(response.status);
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

function decodeEncodedMarkup(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 2 && /&(?:amp;)*(?:lt|#0*60|#x0*3c);\s*\/?(?:p|div|span|h[1-6]|table|img|figure|br)\b/i.test(decoded); pass += 1) {
    const dom = new JSDOM("<!doctype html><textarea></textarea>");
    const textarea = dom.window.document.querySelector("textarea");
    if (!textarea) break;
    textarea.innerHTML = decoded;
    if (textarea.value === decoded) break;
    decoded = textarea.value;
  }
  return decoded;
}

function plainText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isAntiBotPage(title: string, content: string) {
  return /are you a robot|unusual activity|access denied|verify you are human|captcha|security check|enable javascript and cookies/i.test(`${title} ${content}`);
}

function resolveLazyImages(doc: Document) {
  doc.querySelectorAll("img").forEach((image: HTMLImageElement) => {
    const srcset = image.getAttribute("data-srcset") || image.getAttribute("srcset");
    const bestFromSrcset = srcset?.split(",").map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const deferred = image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("data-lazy-src") || image.getAttribute("data-original-src") || image.getAttribute("data-pin-media") || bestFromSrcset;
    const current = image.getAttribute("src") || "";
    if (deferred && (!current || current.startsWith("data:") || /placeholder|loading|blank|blur_/i.test(current))) image.setAttribute("src", deferred);
  });
}

function normalizeRawTextParagraphs(doc: Document) {
  Array.from(doc.body.querySelectorAll("p")).forEach((paragraph) => {
    if (!/<br\s*\/?>[\s\n]*<br\s*\/?>/i.test(paragraph.innerHTML)) return;
    const blocks = paragraph.innerHTML.split(/<br\s*\/?>[\s\n]*<br\s*\/?>/gi).map((block) => block.trim()).filter(Boolean);
    if (blocks.length < 2) return;
    const fragment = doc.createDocumentFragment();
    blocks.forEach((block) => {
      const next = doc.createElement("p");
      next.innerHTML = block.replace(/<br\s*\/?>/gi, " ");
      fragment.appendChild(next);
    });
    paragraph.replaceWith(fragment);
  });
  const containers = [doc.body, ...Array.from(doc.body.querySelectorAll("article,section,div"))];
  containers.forEach((container) => {
    const hasLongDirectText = Array.from(container.childNodes).some((node) => node.nodeType === node.TEXT_NODE && (node.textContent || "").trim().length > 40);
    if (!hasLongDirectText) return;
    const blocks = container.innerHTML.split(/<br\s*\/?>[\s\n]*<br\s*\/?>/gi).map((block) => block.trim()).filter(Boolean);
    if (!blocks.length) return;
    container.innerHTML = blocks.map((block) => /^(?:<(?:p|h[1-6]|blockquote|pre|ul|ol|table|figure|div|section)\b)/i.test(block) ? block : `<p>${block.replace(/<br\s*\/?>/gi, " ")}</p>`).join("\n");
  });
}

export function cleanContent(html: string, baseUrl: string) {
  const dom = new JSDOM(`<body>${decodeEncodedMarkup(html)}</body>`, { url: baseUrl });
  const doc = dom.window.document;
  doc.querySelectorAll("script,style,iframe,object,embed,form,button,nav,aside,footer,header,link,meta,base,svg,canvas,ins,.ads,.advertisement,.promo,.sponsored,.social-share,.share-buttons,.related-posts,.comments,.comment,.disqus,.newsletter-signup,.subscription,.cookie-notice,.gdpr-banner,.contentadv,#txtright,.txtinfo,.hide720,.chapter-nav,.bottom-ad").forEach((node: Element) => node.remove());
  resolveLazyImages(doc);
  Array.from(doc.body.querySelectorAll("*")).forEach((node: Element) => {
    const tag = node.tagName.toLowerCase();
    const href = node.getAttribute("data-href") || node.getAttribute("href");
    const source = node.getAttribute("data-src") || node.getAttribute("data-original") || node.getAttribute("data-lazy-src") || node.getAttribute("data-original-src") || node.getAttribute("data-pin-media") || node.getAttribute("src");
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
  const preferred = Array.from(doc.querySelectorAll("article, [role='main'], .post-content, .entry-content, .article-content, .story-body, .post-body, #main-content, .main-content"));
  const candidates = preferred.length ? preferred : Array.from(doc.querySelectorAll("main, section, div, p"));
  const scored = candidates
    .filter((node) => !node.closest("nav,header,footer,aside,.sidebar,.comments,.ads,.advertisement"))
    .map((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const linkText = Array.from(node.querySelectorAll("a")).map((link) => link.textContent || "").join(" ").replace(/\s+/g, " ").trim().length;
      const paragraphs = node.querySelectorAll("p,li,blockquote").length;
      const linkPenalty = text.length ? (linkText / text.length) * 1_500 : 0;
      return { node, score: Math.min(text.length, 12_000) + paragraphs * 180 - linkPenalty };
    })
    .sort((left, right) => right.score - left.score);
  return (scored[0]?.node || doc.body).innerHTML;
}

function hasReadableArticleContent(content: string) {
  const text = plainText(content);
  if (text.length < 180) return false;
  const dom = new JSDOM(`<body>${content}</body>`);
  const linkText = Array.from(dom.window.document.querySelectorAll("a")).map((link) => link.textContent || "").join(" ").replace(/\s+/g, " ").trim().length;
  return !text.length || linkText / text.length < 0.42;
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
  resolveLazyImages(doc);
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  const image = articleImage(doc, sourceUrl);
  let parsed: ReturnType<Readability["parse"]> | null = null;
  const readabilityDoc = doc.cloneNode(true) as Document;
  try { parsed = new Readability(readabilityDoc, { charThreshold: 20, classesToPreserve: ["caption", "figure", "figcaption", "pullquote", "highlight"], keepClasses: false }).parse(); } catch { parsed = null; }
  const parsedContent = parsed?.content ? cleanContent(parsed.content, sourceUrl) : "";
  const fallback = cleanContent(fallbackContent(doc), sourceUrl);
  const content = hasReadableArticleContent(parsedContent) ? parsedContent : fallback;
  const plain = plainText(content);
  if (isDynamicTemplateContent(content)) throw new DynamicTemplateContentError("أعادت الصفحة قالب JavaScript خامًا بدل نص المقال.");
  if (plain.length < 80) throw new Error("لم يتمكّن التطبيق من العثور على نص كافٍ داخل هذه الصفحة.");
  return { url: sourceUrl, title: h1 || parsed?.title || doc.title || new URL(sourceUrl).hostname, content, excerpt: parsed?.excerpt?.trim() || plain.slice(0, 220), image, readingTimeMinutes: Math.max(1, Math.round(plain.split(" ").filter(Boolean).length / 220)) };
}

async function extractDynamicPageWithReader(raw: string): Promise<ExtractedArticle> {
  const response = await fetch(`https://r.jina.ai/${raw}`, {
    headers: {
      Accept: "text/html, text/plain, application/json",
      "X-Return-Format": "html",
      "X-Respond-With": "html",
    },
    signal: AbortSignal.timeout(28_000),
  });
  if (!response.ok) throw new Error("تعذّر الحصول على نسخة قابلة للقراءة من الصفحة الديناميكية.");
  const rawBody = await response.text();
  let data: unknown = rawBody;
  let title: unknown;
  let url: unknown;
  try {
    const body = JSON.parse(rawBody) as { data?: unknown; content?: unknown; title?: unknown; url?: unknown };
    const readerData = typeof body.data === "object" && body.data ? body.data as { content?: unknown; html?: unknown; title?: unknown; url?: unknown } : undefined;
    data = readerData?.html ?? readerData?.content ?? body.data ?? body.content;
    title = body.title || readerData?.title;
    url = body.url || readerData?.url;
  } catch { /* the reader may return HTML directly */ }
  if (typeof data !== "string" || !data.trim() || isAntiBotPage(typeof title === "string" ? title : "", data)) throw new Error("لم تُعد خدمة الاستخراج محتوى مقالًا قابلًا للقراءة.");
  const extracted = extractArticleFromHtml(`<article>${data}</article>`, typeof url === "string" ? url : raw);
  return typeof title === "string" && title.trim() ? { ...extracted, title: title.trim() } : extracted;
}

export async function extractArticleFromUrl(raw: string) {
  let fetched: { html: string; url: string };
  try {
    fetched = await fetchHtml(raw);
  } catch (error) {
    if (error instanceof RemoteFetchError && [401, 403, 408, 425, 429, 451, 500, 502, 503, 504].includes(error.status)) {
      try { return await extractDynamicPageWithReader(raw); } catch { throw error; }
    }
    throw error;
  }
  try {
    return extractArticleFromHtml(fetched.html, fetched.url);
  } catch (localError) {
    try {
      return await extractDynamicPageWithReader(fetched.url);
    } catch {
      throw localError;
    }
  }
}
