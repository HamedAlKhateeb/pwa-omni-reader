/**
 * Design reminder — «مرسم التصفّح»: imported web content is never trusted.
 * Keep extraction lightweight, then sanitize before any reader rendering.
 */
import type { Article, Highlight } from "./types";

export function makeId(prefix = "item") {
  return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function wordCount(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

export function cleanHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,button,nav,aside,footer,header,link,meta,base").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "style" || (name === "href" && value.startsWith("javascript:"))) node.removeAttribute(attribute.name);
    });
  });
  return doc.body.innerHTML;
}

export function createArticle(url: string, title?: string, content = ""): Article {
  const now = Date.now();
  const safeContent = cleanHtml(content);
  const words = wordCount(safeContent);
  let hostname = url;
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* user input is validated in UI */ }
  return {
    id: makeId("article"), url, title: title?.trim() || hostname || "مقال محفوظ", content: safeContent,
    excerpt: safeContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180),
    tags: [], savedAt: now, updatedAt: now, progress: 0, isRead: false, isArchived: false,
    isFavorite: false, readingTimeMinutes: words ? Math.max(1, Math.round(words / 220)) : 0,
    sourceStatus: safeContent ? "cached" : "link-only",
  };
}

export function extractArticleFromHtml(html: string, url: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector("article, main, [role='main'], .article-content, .post-content, .entry-content") ?? doc.body;
  const title = doc.querySelector("h1")?.textContent?.trim() || doc.title || new URL(url).hostname;
  const image = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
  return createArticle(url, title, root.innerHTML ? cleanHtml(root.innerHTML) : "");
}

export function highlightedHtml(html: string, highlights: Highlight[]) {
  const doc = new DOMParser().parseFromString(cleanHtml(html), "text/html");
  highlights.forEach((highlight) => {
    if (!highlight.quote.trim()) return;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    while ((node = walker.nextNode() as Text | null)) {
      const index = node.data.indexOf(highlight.quote);
      if (index < 0 || node.parentElement?.closest("mark")) continue;
      const range = doc.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + highlight.quote.length);
      const mark = doc.createElement("mark");
      mark.className = "reader-highlight";
      mark.dataset.highlightId = highlight.id;
      try { range.surroundContents(mark); } catch { /* selection crosses an unsupported boundary */ }
      break;
    }
  });
  return doc.body.innerHTML;
}
