// Integrated projects have no application-level expiration or automatic cleanup.
// Keep middleware in place so existing Cloudflare Pages routing is unchanged.
export function onRequest(context) {
  return context.next();
}
