export type SharedLinkSeed = { url: string; title: string };

export function readSharedLink(search: string): SharedLinkSeed | null {
  const params = new URLSearchParams(search);
  const text = params.get("share_text") || "";
  const title = params.get("share_title") || "";
  const candidate = params.get("share_url") || text.match(/https?:\/\/[^\s<>"']+/i)?.[0] || title.match(/https?:\/\/[^\s<>"']+/i)?.[0] || "";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { url: parsed.href, title };
  } catch {
    return null;
  }
}
