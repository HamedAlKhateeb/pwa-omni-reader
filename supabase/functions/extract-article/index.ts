import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const ALLOWED_ORIGINS = new Set([
  "https://hamedalkhateeb.github.io",
  "http://localhost:5173",
]);
const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

function headers(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://hamedalkhateeb.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function error(message: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: message }), { status, headers: headers(origin) });
}

function isBlockedAddress(address: string) {
  const value = address.toLowerCase();
  if (value.includes(":")) return value === "::" || value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("::ffff:");
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isLiteralIp(host: string) { return /^[0-9.]+$/.test(host) || host.includes(":"); }

async function validateUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("الرابط غير صالح."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname) throw new Error("الرابط غير مسموح.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || (isLiteralIp(host) && isBlockedAddress(host))) throw new Error("لا يمكن جلب عناوين داخلية.");
  if (!isLiteralIp(host)) {
    const records = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
    const ipv6 = await Deno.resolveDns(host, "AAAA").catch(() => [] as string[]);
    if ((!records.length && !ipv6.length) || [...records, ...ipv6].some(isBlockedAddress)) throw new Error("لا يمكن جلب عنوان غير آمن.");
  }
  return url;
}

async function fetchHtml(raw: string) {
  let url = await validateUrl(raw);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "MasarReader/1.0" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("تجاوز الموقع عدد التحويلات المسموح.");
      url = await validateUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`تعذّر الوصول إلى المقال (HTTP ${response.status}).`);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) throw new Error("هذا الرابط لا يشير إلى صفحة HTML قابلة للقراءة.");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw new Error("صفحة المقال كبيرة جدًا للاستخراج.");
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_BYTES) throw new Error("صفحة المقال كبيرة جدًا للاستخراج.");
    return { html, url: url.href };
  }
  throw new Error("تعذّر الوصول إلى المقال.");
}

function sanitize(html: string, baseUrl: string) {
  const { document } = parseHTML(`<body>${html}</body>`);
  document.querySelectorAll("script,style,iframe,object,embed,form,button,nav,aside,footer,header,link,meta,base").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes || [])) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "style" || (name === "href" && value.startsWith("javascript:"))) node.removeAttribute(attribute.name);
    }
  });
  document.querySelectorAll("img").forEach((image) => {
    const source = image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("src");
    if (!source) return;
    try { image.setAttribute("src", new URL(source, baseUrl).href); } catch { image.removeAttribute("src"); }
  });
  return document.body.innerHTML;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return error("الطريقة غير مسموحة.", 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return error("مصدر الطلب غير مسموح.", 403, origin);
  try {
    const body = await request.json();
    if (!body || typeof body.url !== "string" || body.url.length > 2048) return error("أرسل رابط مقال صالحًا.", 400, origin);
    const { html, url } = await fetchHtml(body.url);
    const { document } = parseHTML(html);
    const titleFromPage = document.querySelector("h1")?.textContent?.trim();
    const image = document.querySelector("meta[property='og:image']")?.getAttribute("content") || undefined;
    const parsed = new Readability(document, { charThreshold: 20, classesToPreserve: ["caption", "figure", "figcaption", "pullquote", "highlight"], keepClasses: false }).parse();
    const fallback = document.querySelector("article, [role='main'], .post-content, .entry-content, .content, .article-content, .story-body, .post-body, #main-content, .main-content") || document.body;
    const content = sanitize(parsed?.content && parsed.content.length >= 300 ? parsed.content : fallback.innerHTML, url);
    const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 80) return error("لم يتمكّن التطبيق من العثور على نص كافٍ داخل هذه الصفحة.", 422, origin);
    return new Response(JSON.stringify({ url, title: titleFromPage || parsed?.title || document.title || new URL(url).hostname, content, excerpt: parsed?.excerpt?.trim() || text.slice(0, 220), image, readingTimeMinutes: Math.max(1, Math.round(text.split(" ").filter(Boolean).length / 220)) }), { headers: headers(origin) });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "تعذّر استخراج المقال.", 400, origin);
  }
});
