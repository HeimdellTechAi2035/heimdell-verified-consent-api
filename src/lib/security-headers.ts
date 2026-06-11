import { getAllowedEmbedRequestOrigins } from "@/lib/embed-origin";

export function getSupabaseOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }

  try {
    return new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(params: {
  pathname: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  const isEmbedRoute = params.pathname.startsWith("/embed");
  const frameAncestors = isEmbedRoute
    ? getAllowedEmbedRequestOrigins(env)
    : [];
  const supabaseOrigin = getSupabaseOrigin(env);
  const connectSrc = ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])];

  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["object-src", "'none'"],
    ["frame-ancestors", ...(frameAncestors.length ? frameAncestors : ["'none'"])],
    ["script-src", "'self'", "'unsafe-inline'", "'unsafe-eval'"],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'", "data:"],
    ["connect-src", ...connectSrc],
    ["form-action", "'self'"],
  ];

  return directives
    .map(([name, ...values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function buildPermissionsPolicy(): string {
  return [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
  ].join(", ");
}
