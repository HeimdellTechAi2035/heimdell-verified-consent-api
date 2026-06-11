#!/usr/bin/env node
// Minimal verification for src/lib/rate-limit.ts.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadRateLimitModule() {
  const source = readFileSync("src/lib/rate-limit.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "next/server") {
      return {
        NextResponse: {
          json(body, init) {
            return { body, init };
          },
        },
      };
    }
    if (specifier === "@/lib/request-ip") {
      return { getRequestIp: () => "203.0.113.10" };
    }
    return require(specifier);
  };

  const execute = new Function("require", "module", "exports", transpiled);
  execute(localRequire, module, module.exports);

  return module.exports;
}

const rateLimit = loadRateLimitModule();
const policy = { name: "test_policy", limit: 2, windowMs: 1000 };
const rawToken = "raw-token-that-must-not-be-stored";
const rawApiKey = "hvcs_dev_raw-api-key-that-must-not-be-stored";

rateLimit.resetRateLimitForTests();

const first = rateLimit.checkRateLimit(policy, ["route", "ip", rawToken], 0);
const second = rateLimit.checkRateLimit(policy, ["route", "ip", rawToken], 100);
const third = rateLimit.checkRateLimit(policy, ["route", "ip", rawToken], 200);

assert.equal(first.allowed, true);
assert.equal(second.allowed, true);
assert.equal(third.allowed, false);
assert.equal(third.retryAfterSeconds, 1);
assert.equal(third.key.includes(rawToken), false);

const reset = rateLimit.checkRateLimit(policy, ["route", "ip", rawToken], 1100);
assert.equal(reset.allowed, true);

const key = rateLimit.buildRateLimitKey(["route", rawApiKey]);
assert.equal(key.includes(rawApiKey), false);
assert.equal(rateLimit.safeFingerprint(rawApiKey).length, 16);

const response = rateLimit.rateLimitResponse(third);
assert.equal(response.init.status, 429);
assert.equal(response.init.headers["Retry-After"], "1");
assert.equal(response.body.error.code, "TOO_MANY_REQUESTS");

assert.equal(rateLimit.getRateLimitStore({}), "memory");
assert.equal(
  rateLimit.getRateLimitStore({
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  }),
  "upstash"
);
assert.equal(rateLimit.getRateLimitStore({ RATE_LIMIT_STORE: "memory" }), "memory");
assert.equal(rateLimit.getRateLimitStore({ RATE_LIMIT_STORE: "upstash" }), "upstash");

const originalFetch = globalThis.fetch;
let capturedUpstashRequest = null;
globalThis.fetch = async (url, init) => {
  capturedUpstashRequest = { url, init };
  return {
    ok: true,
    json: async () => [{ result: 1 }, { result: 1 }, { result: 1000 }],
  };
};

const shared = await rateLimit.checkRateLimitShared(
  policy,
  ["route", "ip", rawApiKey],
  {
    RATE_LIMIT_STORE: "upstash",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "secret-token",
  }
);
assert.equal(shared.allowed, true);
assert.equal(capturedUpstashRequest.url, "https://example.upstash.io/pipeline");
assert.equal(
  capturedUpstashRequest.init.headers.Authorization,
  "Bearer secret-token"
);
assert.equal(capturedUpstashRequest.init.body.includes(rawApiKey), false);
assert.equal(capturedUpstashRequest.init.body.includes(rawToken), false);

globalThis.fetch = async () => ({ ok: false, status: 503 });
await assert.rejects(
  () =>
    rateLimit.checkRateLimitShared(policy, ["route", "ip"], {
      RATE_LIMIT_STORE: "upstash",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "secret-token",
    }),
  /HTTP 503/
);
globalThis.fetch = originalFetch;

console.log("Rate limit verification passed.");
