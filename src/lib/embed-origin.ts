export function parseAllowedOrigins(value?: string | null): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        const url = new URL(origin);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return null;
        }
        return url.origin;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => Boolean(origin));
}

export function getConfiguredEmbedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseAllowedOrigins(
    env.ALLOWED_EMBED_ORIGINS ?? env.CRM_ALLOWED_ORIGINS
  );
}

export function getAppOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.APP_URL) {
    return null;
  }

  try {
    return new URL(env.APP_URL).origin;
  } catch {
    return null;
  }
}

export function getAllowedEmbedRequestOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const origins = new Set<string>();
  const appOrigin = getAppOrigin(env);

  if (appOrigin) {
    origins.add(appOrigin);
  }

  for (const origin of getConfiguredEmbedOrigins(env)) {
    origins.add(origin);
  }

  return [...origins];
}

export function getRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");

  if (origin) {
    return origin.replace(/\/$/, "");
  }

  const referer = request.headers.get("referer");

  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isAllowedEmbedRequestOrigin(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const requestOrigin = getRequestOrigin(request);

  if (!requestOrigin) {
    return true;
  }

  return getAllowedEmbedRequestOrigins(env).includes(requestOrigin);
}
