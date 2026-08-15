export function isPasswordRecoveryRoute(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return query.has("reset-password") || fragment.get("type") === "recovery" || Boolean(fragment.get("access_token"));
}
