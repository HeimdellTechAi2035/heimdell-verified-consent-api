import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
} from "@/lib/security-headers";
import type { PwaAppKey } from "@/lib/pwa-identity";

// Vanity subdomains (e.g. admin.telecomcompliance.uk) that should land
// visitors straight on the matching branded login page instead of the
// marketing homepage. This is presentation only -- actual dashboard access
// stays gated by role via the existing server-side auth checks, not by
// which subdomain was used to get there.
const SUBDOMAIN_TO_PWA_APP_KEY: Record<string, PwaAppKey> = {
  admin: "company",
  client: "client",
  seller: "seller",
};

function resolveSubdomainAppKey(host: string): PwaAppKey | null {
  const hostname = host.split(":")[0].toLowerCase();
  const label = hostname.split(".")[0];
  return SUBDOMAIN_TO_PWA_APP_KEY[label] ?? null;
}

function buildResponse(
  req: NextRequest,
  requestHeaders: Headers,
  rewriteToPathname: string | null
): NextResponse {
  if (rewriteToPathname) {
    const url = req.nextUrl.clone();
    url.pathname = rewriteToPathname;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-heimdell-pathname", req.nextUrl.pathname);

  const subdomainAppKey = resolveSubdomainAppKey(req.headers.get("host") ?? "");
  const isSubdomainEntryPath =
    req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/login";
  const rewriteToPathname =
    subdomainAppKey && isSubdomainEntryPath ? `/login/${subdomainAppKey}` : null;

  let response = buildResponse(req, requestHeaders, rewriteToPathname);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = buildResponse(req, requestHeaders, rewriteToPathname);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    await supabase.auth.getUser();
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", buildPermissionsPolicy());
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy({ pathname: req.nextUrl.pathname })
  );

  if (!req.nextUrl.pathname.startsWith("/embed")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  if (req.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
