// Request identity helpers for abuse protection.
// These values are operational signals only; configure trusted proxy handling
// at the hosting layer before relying on forwarded headers in production.

export type HeaderReader = {
  get(name: string): string | null;
};

export type RequestLike = {
  headers: HeaderReader;
};

function normalizeIp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed.replace(/[^a-zA-Z0-9:.[\]-]/g, "");
}

export function getRequestIpFromHeaders(headers: HeaderReader): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0] ?? null;

  return (
    normalizeIp(firstForwarded) ??
    normalizeIp(headers.get("x-real-ip")) ??
    normalizeIp(headers.get("cf-connecting-ip")) ??
    normalizeIp(headers.get("x-vercel-forwarded-for")) ??
    "unknown"
  );
}

export function getRequestIp(req: RequestLike): string {
  return getRequestIpFromHeaders(req.headers);
}
