#!/usr/bin/env node
// Verifies signed CRM embed token behavior and safe route source constraints.

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

const embedToken = loadTsModule("src/lib/embed-token.ts");
const secret = "test-secret-that-is-long-enough-for-hmac";

const issued = embedToken.createEmbedToken({
  scope: "verification_status",
  organizationId: "org_a",
  clientId: "client_a",
  targetId: "session_a",
  ttlSeconds: 600,
  secret,
});

const claims = embedToken.verifyEmbedToken({
  token: issued.token,
  expectedScope: "verification_status",
  expectedTargetId: "session_a",
  secret,
});

assert.equal(claims.organizationId, "org_a");
assert.equal(claims.clientId, "client_a");
assert.equal(claims.scope, "verification_status");
assert.equal(claims.targetId, "session_a");
assert.ok(claims.jti.length > 10);

const serializedToken = Buffer.from(issued.token, "utf8").toString("utf8");
assert.equal(serializedToken.includes("apiKeyHash"), false);
assert.equal(serializedToken.includes("tokenHash"), false);
assert.equal(serializedToken.includes("encryptedAccountNumber"), false);
assert.equal(serializedToken.includes("raw-token"), false);
assert.equal(serializedToken.includes("customerEmail"), false);

assert.throws(
  () =>
    embedToken.verifyEmbedToken({
      token: issued.token,
      expectedScope: "deal_status",
      expectedTargetId: "session_a",
      secret,
    }),
  embedToken.EmbedTokenError
);

assert.throws(
  () =>
    embedToken.verifyEmbedToken({
      token: issued.token,
      expectedScope: "verification_status",
      expectedTargetId: "session_b",
      secret,
    }),
  embedToken.EmbedTokenError
);

assert.throws(
  () =>
    embedToken.verifyEmbedToken({
      token: issued.token,
      expectedScope: "verification_status",
      expectedTargetId: "session_a",
      secret,
      nowSeconds: claims.expiresAt + 1,
    }),
  embedToken.EmbedTokenError
);

assert.throws(
  () =>
    embedToken.createEmbedToken({
      scope: "deal_status",
      organizationId: "org_a",
      targetId: "deal_a",
      secret: "short",
    }),
  embedToken.EmbedTokenError
);

const verificationRoute = readFileSync(
  "src/app/api/v1/embed/verification/[sessionId]/status/route.ts",
  "utf8"
);
const dealRoute = readFileSync(
  "src/app/api/v1/embed/deal/[clientReference]/status/route.ts",
  "utf8"
);

for (const source of [verificationRoute, dealRoute]) {
  assert.equal(source.includes("verifyEmbedToken"), true);
  assert.equal(source.includes("isAllowedEmbedRequestOrigin"), true);
  assert.equal(source.includes("organizationId: claims.organizationId"), true);
  assert.equal(source.includes("tokenHash"), false);
  assert.equal(source.includes("apiKeyHash"), false);
  assert.equal(source.includes("encryptedAccountNumber"), false);
  assert.equal(source.includes("customerEmail"), false);
  assert.equal(source.includes("customerPhone"), false);
  assert.equal(source.includes("customerAddress"), false);
  assert.equal(source.includes("certificateJson"), false);
  assert.equal(source.includes("webhookSecret"), false);
}

const widgetSource = readFileSync("public/widget.js", "utf8");
assert.equal(widgetSource.includes("x-api-key"), false);
assert.equal(widgetSource.includes("data-embed-token"), true);
assert.equal(widgetSource.includes("hvcs_dev_"), false);
assert.equal(widgetSource.includes("hvcs_live_"), false);

console.log("Embed token verification passed.");
