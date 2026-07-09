// Fixed-window rate limiter.
// - In-memory store remains available for local/dev fallback.
// - Upstash Redis REST store is supported for shared multi-instance production.

import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getRequestIp } from "@/lib/request-ip";

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = "memory" | "upstash";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  key: string;
};

const buckets = new Map<string, RateLimitBucket>();
const RATE_LIMIT_KEY_PREFIX = "hvcs:rate-limit";

export const RATE_LIMIT_POLICIES = {
  publicTokenLookup: {
    name: "public_token_lookup",
    limit: 30,
    windowMs: 60_000,
  },
  publicTokenSubmit: {
    name: "public_token_submit",
    limit: 8,
    windowMs: 60_000,
  },
  invalidTokenAttempt: {
    name: "invalid_token_attempt",
    limit: 12,
    windowMs: 60_000,
  },
  apiKeyPreAuth: {
    name: "api_key_pre_auth",
    limit: 60,
    windowMs: 60_000,
  },
  apiKeyAuthenticated: {
    name: "api_key_authenticated",
    limit: 120,
    windowMs: 60_000,
  },
  embedStatus: {
    name: "embed_status",
    limit: 120,
    windowMs: 60_000,
  },
  publicSignupSubmit: {
    name: "public_signup_submit",
    limit: 5,
    windowMs: 60_000,
  },
  publicContactSubmit: {
    name: "public_contact_submit",
    limit: 5,
    windowMs: 60_000,
  },
} as const satisfies Record<string, RateLimitPolicy>;

export function safeFingerprint(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function buildRateLimitKey(parts: readonly string[]): string {
  return parts.map((part) => safeFingerprint(part, 24)).join(":");
}

export function checkRateLimit(
  policy: RateLimitPolicy,
  keyParts: readonly string[],
  now = Date.now()
): RateLimitResult {
  const key = `${policy.name}:${buildRateLimitKey(keyParts)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit - 1,
      resetAt: now + policy.windowMs,
      retryAfterSeconds: 0,
      key,
    };
  }

  existing.count += 1;
  const remaining = Math.max(policy.limit - existing.count, 0);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000)
  );

  return {
    allowed: existing.count <= policy.limit,
    limit: policy.limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds,
    key,
  };
}

function normalizeUpstashUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export function getRateLimitStore(
  env: NodeJS.ProcessEnv = process.env
): RateLimitStore {
  const configured = env.RATE_LIMIT_STORE?.trim().toLowerCase();

  if (configured === "upstash" || configured === "redis") {
    return "upstash";
  }

  if (configured === "memory" || configured === "in-memory") {
    return "memory";
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return "upstash";
  }

  return "memory";
}

export function shouldFailOpenOnRateLimitStoreError(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return ["1", "true", "yes"].includes(
    String(env.RATE_LIMIT_FAIL_OPEN ?? "").toLowerCase()
  );
}

async function checkUpstashRateLimit(
  policy: RateLimitPolicy,
  keyParts: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<RateLimitResult> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Upstash rate limiter requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
  }

  const key = `${RATE_LIMIT_KEY_PREFIX}:${policy.name}:${buildRateLimitKey(
    keyParts
  )}`;
  const response = await fetch(`${normalizeUpstashUrl(url)}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, policy.windowMs, "NX"],
      ["PTTL", key],
    ]),
  });

  if (!response.ok) {
    throw new Error(`Upstash rate limiter returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  const error = data.find((item) => item.error)?.error;
  if (error) {
    throw new Error(`Upstash rate limiter command failed: ${error}`);
  }

  const count = Number(data[0]?.result);
  const ttlMs = Number(data[2]?.result);

  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new Error("Upstash rate limiter returned an invalid response.");
  }

  const now = Date.now();
  const safeTtlMs = ttlMs > 0 ? ttlMs : policy.windowMs;
  const resetAt = now + safeTtlMs;
  const remaining = Math.max(policy.limit - count, 0);

  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil(safeTtlMs / 1000)),
    key,
  };
}

export async function checkRateLimitShared(
  policy: RateLimitPolicy,
  keyParts: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<RateLimitResult> {
  const store = getRateLimitStore(env);

  if (store === "memory") {
    return checkRateLimit(policy, keyParts);
  }

  return checkUpstashRateLimit(policy, keyParts, env);
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please retry later.",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

export function logRateLimitEvent(params: {
  policy: RateLimitPolicy;
  route: string;
  ip: string;
  key: string;
}) {
  console.warn("[rate-limit] request blocked", {
    policy: params.policy.name,
    route: params.route,
    ipFingerprint: safeFingerprint(params.ip, 12),
    keyFingerprint: safeFingerprint(params.key, 12),
  });
}

export function logRateLimitStoreError(params: {
  policy: RateLimitPolicy;
  route: string;
  ip: string;
  errorName: string;
}) {
  console.warn("[rate-limit] shared limiter unavailable", {
    policy: params.policy.name,
    route: params.route,
    ipFingerprint: safeFingerprint(params.ip, 12),
    errorName: params.errorName,
  });
}

export async function enforceRateLimit(params: {
  req: NextRequest | Request;
  policy: RateLimitPolicy;
  route: string;
  identifiers: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<NextResponse | null> {
  const ip = getRequestIp(params.req);
  let result: RateLimitResult;

  try {
    result = await checkRateLimitShared(
      params.policy,
      [params.route, ip, ...params.identifiers],
      params.env
    );
  } catch (error) {
    logRateLimitStoreError({
      policy: params.policy,
      route: params.route,
      ip,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    if (shouldFailOpenOnRateLimitStoreError(params.env)) {
      return null;
    }

    return rateLimitResponse({
      allowed: false,
      limit: params.policy.limit,
      remaining: 0,
      resetAt: Date.now() + params.policy.windowMs,
      retryAfterSeconds: Math.max(1, Math.ceil(params.policy.windowMs / 1000)),
      key: `${params.policy.name}:store-unavailable`,
    });
  }

  if (result.allowed) return null;

  logRateLimitEvent({
    policy: params.policy,
    route: params.route,
    ip,
    key: result.key,
  });
  return rateLimitResponse(result);
}

export function resetRateLimitForTests() {
  buckets.clear();
}
