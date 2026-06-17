// Resolve the public site origin for redirects (OAuth, emails, etc.).
// Prefer NEXT_PUBLIC_SITE_URL in production so callbacks stay correct behind
// proxies and custom domains.
export function getSiteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost.split(",")[0].trim()}`;
  return url.origin;
}
