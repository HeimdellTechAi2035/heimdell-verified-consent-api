#!/usr/bin/env node
// Verifies production-safe CRM widget and embed page constraints.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widget = readFileSync("public/widget.js", "utf8");
const panel = readFileSync("src/components/embed/EmbedStatusPanel.tsx", "utf8");
const verificationPage = readFileSync(
  "src/app/embed/verification/[sessionId]/page.tsx",
  "utf8"
);
const dealPage = readFileSync(
  "src/app/embed/deal/[clientReference]/page.tsx",
  "utf8"
);
const verificationRoute = readFileSync(
  "src/app/api/v1/embed/verification/[sessionId]/status/route.ts",
  "utf8"
);
const dealRoute = readFileSync(
  "src/app/api/v1/embed/deal/[clientReference]/status/route.ts",
  "utf8"
);
const crmDocs = readFileSync("CRM_INTEGRATION.md", "utf8");

assert.equal(widget.includes("data-embed-token"), true);
assert.equal(widget.includes("data-api-key"), true);
assert.equal(widget.includes("getAttribute(\"data-api-key\")"), true);
assert.equal(widget.includes("apiKey"), true);
assert.equal(widget.includes("x-api-key"), false);
assert.equal(widget.includes("console.log"), false);
assert.equal(widget.includes("hvcs_dev_"), false);
assert.equal(widget.includes("hvcs_live_"), false);
assert.equal(widget.includes("Authorization"), true);
assert.equal(widget.includes("Bearer "), true);

for (const sensitive of [
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "tokenHash",
  "apiKeyHash",
  "encryptedAccountNumber",
  "certificateJson",
  "webhookSecret",
  "verification_url",
]) {
  assert.equal(widget.includes(sensitive), false, `widget contains ${sensitive}`);
  assert.equal(panel.includes(sensitive), false, `panel contains ${sensitive}`);
}

assert.equal(panel.includes("EmbedStatusPanel"), true);
assert.equal(panel.includes("Authorization"), true);
assert.equal(panel.includes("Bearer"), true);
assert.equal(panel.includes("embedToken={token}"), false);

assert.equal(verificationPage.includes("TokenRequiredPanel"), true);
assert.equal(verificationPage.includes("EmbedStatusPanel"), true);
assert.equal(dealPage.includes("TokenRequiredPanel"), true);
assert.equal(dealPage.includes("EmbedStatusPanel"), true);

for (const source of [verificationRoute, dealRoute]) {
  assert.equal(source.includes("verifyEmbedToken"), true);
  assert.equal(source.includes("extractBearerEmbedToken"), true);
  assert.equal(source.includes("organizationId: claims.organizationId"), true);
}

assert.equal(crmDocs.includes("data-embed-token"), true);
assert.equal(crmDocs.includes("POST /api/v1/embed-tokens"), true);
assert.equal(crmDocs.includes("HEIMDELL_API_KEY"), true);
assert.equal(crmDocs.includes("short-lived"), true);
assert.equal(crmDocs.includes("real-secret"), false);

console.log("CRM widget verification passed.");
