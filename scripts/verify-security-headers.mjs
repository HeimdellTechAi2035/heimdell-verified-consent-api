#!/usr/bin/env node
// Verifies frame, CSP, and embed origin safety constraints.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path) {
  const source = readFileSync(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const execute = new Function("require", "module", "exports", transpiled);
  execute(require, module, module.exports);
  return module.exports;
}

const embedOrigin = loadTsModule("src/lib/embed-origin.ts");

const env = {
  APP_URL: "https://verify.example.com",
  ALLOWED_EMBED_ORIGINS:
    "https://crm.example.com, https://app.hubspot.com https://salesforce.example.com/",
};

assert.deepEqual(embedOrigin.parseAllowedOrigins(env.ALLOWED_EMBED_ORIGINS), [
  "https://crm.example.com",
  "https://app.hubspot.com",
  "https://salesforce.example.com",
]);

assert.deepEqual(embedOrigin.parseAllowedOrigins("javascript:alert(1), not-a-url"), []);
assert.equal(embedOrigin.getAppOrigin(env), "https://verify.example.com");

const allowedOrigins = embedOrigin.getAllowedEmbedRequestOrigins(env);
assert.equal(allowedOrigins.includes("https://verify.example.com"), true);
assert.equal(allowedOrigins.includes("https://crm.example.com"), true);

const allowedRequest = new Request("https://verify.example.com/api/status", {
  headers: { origin: "https://crm.example.com" },
});
const sameSiteRequest = new Request("https://verify.example.com/api/status", {
  headers: { referer: "https://verify.example.com/embed/deal/abc?embedToken=redacted" },
});
const blockedRequest = new Request("https://verify.example.com/api/status", {
  headers: { origin: "https://evil.example.com" },
});
const serverRequest = new Request("https://verify.example.com/api/status");

assert.equal(embedOrigin.isAllowedEmbedRequestOrigin(allowedRequest, env), true);
assert.equal(embedOrigin.isAllowedEmbedRequestOrigin(sameSiteRequest, env), true);
assert.equal(embedOrigin.isAllowedEmbedRequestOrigin(blockedRequest, env), false);
assert.equal(embedOrigin.isAllowedEmbedRequestOrigin(serverRequest, env), true);

const middleware = readFileSync("src/middleware.ts", "utf8");
const securityHeaders = readFileSync("src/lib/security-headers.ts", "utf8");
const verificationRoute = readFileSync(
  "src/app/api/v1/embed/verification/[sessionId]/status/route.ts",
  "utf8"
);
const dealRoute = readFileSync(
  "src/app/api/v1/embed/deal/[clientReference]/status/route.ts",
  "utf8"
);
const widget = readFileSync("public/widget.js", "utf8");

assert.equal(middleware.includes("Content-Security-Policy"), true);
assert.equal(middleware.includes("X-Content-Type-Options"), true);
assert.equal(middleware.includes("Referrer-Policy"), true);
assert.equal(middleware.includes("Permissions-Policy"), true);
assert.equal(middleware.includes("Strict-Transport-Security"), true);
assert.equal(middleware.includes('startsWith("/embed")'), true);
assert.equal(middleware.includes("X-Frame-Options"), true);

assert.equal(securityHeaders.includes("frame-ancestors"), true);
assert.equal(securityHeaders.includes("'none'"), true);
assert.equal(securityHeaders.includes("getAllowedEmbedRequestOrigins"), true);
assert.equal(securityHeaders.includes("NEXT_PUBLIC_SUPABASE_URL"), true);
assert.equal(securityHeaders.includes("EMBED_TOKEN_SECRET"), false);
assert.equal(securityHeaders.includes("ENCRYPTION_KEY"), false);

for (const route of [verificationRoute, dealRoute]) {
  assert.equal(route.includes("isAllowedEmbedRequestOrigin"), true);
  assert.equal(route.includes("Embed origin is not allowed"), true);
  assert.equal(route.includes("tokenHash"), false);
  assert.equal(route.includes("apiKeyHash"), false);
  assert.equal(route.includes("encryptedAccountNumber"), false);
}

assert.equal(widget.includes("x-api-key"), false);
assert.equal(widget.includes("data-embed-token"), true);

console.log("Security header and embed origin verification passed.");
