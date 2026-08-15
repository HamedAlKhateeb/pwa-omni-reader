/**
 * Design reminder — «مرسم التصفّح»: Readability is applied before saving.
 * Sanitization happens after extraction so the reader never renders active content.
 */
import { Readability } from "@mozilla/readability";
import type { Article, Highlight } from "./types";

export function makeId(prefix = "item") { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`; }
export function wordCount(html: string) { return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length; }
export function toEpochMillis(value: unknown, fallback = 0) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return fallback;
  return timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
}
export function savedAtOf(article: Pick<Article, "savedAt" | "updatedAt">) {
  return toEpochMillis(article.savedAt, toEpochMillis(article.updatedAt, 0));
}
export function newestSavedFirst(left: Pick<Article, "savedAt" | "updatedAt" | "id">, right: Pick<Article, "savedAt" | "updatedAt" | "id">) {
  return savedAtOf(right) - savedAtOf(left) || right.id.localeCompare(left.id);
}
export function sortArticlesBySavedAt<T extends Pick<Article, "savedAt" | "updatedAt" | "id">>(articles: T[]) {
  return [...articles].sort(newestSavedFirst);
}
export function isBrokenArticleContent(html: string) {
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return /{{\s*(?:vm|app|state|data|[\w$]+)\.[^}]+}}/i.test(html) || /\b(?:vm|app|state)\.(?:title|content|body|article)\b/i.test(plain);
}
const ALLOWED_READER_TAGS = new Set(["a", "b", "blockquote", "br", "code", "del", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p", "pre", "s", "section", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul"]);

function safeAbsoluteUrl(value: string, baseUrl: string) {
  try {
    const parsed = new URL(value, baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function cleanHtml(html: string, baseUrl = "https://example.invalid/") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,button,nav,aside,footer,header,link,meta,base,svg,canvas").forEach((node) => node.remove());
  Array.from(doc.body.querySelectorAll("*")).forEach((node) => {
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
    if (tag === "a") {
      const safeHref = href ? safeAbsoluteUrl(href, baseUrl) : null;
      if (safeHref) node.setAttribute("href", safeHref);
      else node.removeAttribute("href");
    }
    if (tag === "img") {
      const safeSource = source ? safeAbsoluteUrl(source, baseUrl) : null;
      if (safeSource) {
        node.setAttribute("src", safeSource);
        if (alt?.trim()) node.setAttribute("alt", alt.trim().slice(0, 500));
      }
      else node.remove();
    }
    if (["td", "th"].includes(tag)) {
      if (colspan && /^\d{1,2}$/.test(colspan)) node.setAttribute("colspan", colspan);
      if (rowspan && /^\d{1,2}$/.test(rowspan)) node.setAttribute("rowspan", rowspan);
    }
  });
  return doc.body.innerHTML;
}
export function createArticle(url: string, title?: string, content = ""): Article { const now = Date.now(); const cleaned = cleanHtml(content, url); const safeContent = isBrokenArticleContent(cleaned) ? "" : cleaned; const words = wordCount(safeContent); let hostname = url; try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* input is validated by caller */ } return { id: makeId("article"), url, title: title?.trim() || hostname || "مقال محفوظ", content: safeContent, excerpt: safeContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180), tags: [], savedAt: now, updatedAt: now, contentUpdatedAt: safeContent ? now : undefined, progress: 0, isRead: false, isArchived: false, isFavorite: false, readingTimeMinutes: words ? Math.max(1, Math.round(words / 220)) : 0, sourceStatus: safeContent ? "cached" : "link-only" }; }
function resolveLazyImages(doc: Document) { doc.querySelectorAll("img").forEach((image) => { const preferred = image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("data-lazy-src"); if (preferred) image.setAttribute("src", preferred); const srcset = image.getAttribute("data-srcset") || image.getAttribute("srcset"); if (srcset) { const best = srcset.split(",").map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean).pop(); if (best) image.setAttribute("src", best); } }); }
function fallbackContent(doc: Document) { const root = doc.querySelector("article, [role='main'], .post-content, .entry-content, .content, .article-content, .story-body, .post-body, #main-content, .main-content") ?? Array.from(doc.querySelectorAll("p,div,section")).filter((item) => item.textContent?.trim().length && !item.closest("nav,header,footer,aside,.sidebar,.comments,.ads")).sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0))[0] ?? doc.body; return root.innerHTML; }
export function extractArticleFromHtml(html: string, url: string) { const doc = new DOMParser().parseFromString(html, "text/html"); resolveLazyImages(doc); const clone = doc.cloneNode(true) as Document; let parsed: ReturnType<Readability["parse"]> | null = null; try { parsed = new Readability(clone, { charThreshold: 20, classesToPreserve: ["caption", "figure", "figcaption", "pullquote", "highlight"], keepClasses: false }).parse(); } catch { parsed = null; } const content = parsed?.content && parsed.content.length >= 300 ? parsed.content : fallbackContent(doc); const title = doc.querySelector("h1")?.textContent?.trim() || parsed?.title || doc.title || new URL(url).hostname; const article = createArticle(url, title, content); article.image = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || undefined; article.excerpt = parsed?.excerpt?.trim() || article.excerpt; return article; }
export function highlightedHtml(html: string, highlights: Highlight[], baseUrl?: string) { const doc = new DOMParser().parseFromString(cleanHtml(html, baseUrl), "text/html"); highlights.forEach((highlight) => { if (!highlight.quote.trim()) return; const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT); let node: Text | null = null; while ((node = walker.nextNode() as Text | null)) { const index = node.data.indexOf(highlight.quote); if (index < 0 || node.parentElement?.closest("mark")) continue; const range = doc.createRange(); range.setStart(node, index); range.setEnd(node, index + highlight.quote.length); const mark = doc.createElement("mark"); mark.className = "reader-highlight"; mark.dataset.highlightId = highlight.id; try { range.surroundContents(mark); } catch { /* selection crosses a DOM boundary */ } break; } }); return doc.body.innerHTML; }
