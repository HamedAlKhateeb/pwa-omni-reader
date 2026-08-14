export type SharedLinkSeed = { url: string; title: string };

export function readSharedLink(search: string): SharedLinkSeed | null {
  const params = new URLSearchParams(search);
  if (!params.has("share")) return null;
  const text = params.get("share_text") || "";
  const candidate = params.get("share_url") || text.match(/https?:\/\/[^\s<>"']+/i)?.[0] || "";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { url: parsed.href, title: params.get("share_title") || "" };
  } catch {
    return null;
  }
}
