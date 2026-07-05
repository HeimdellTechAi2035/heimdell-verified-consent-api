#!/usr/bin/env node
// Static demo readiness checks. Does not call production services or print secrets.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "DEMO_RUNBOOK.md",
  "scripts/setup-demo.mjs",
  "src/app/api/v1/sales/intake/route.ts",
  "src/app/v/[token]/page.tsx",
  "src/app/api/v1/verification-sessions/[token]/complete/route.ts",
  "src/app/dashboard/overview/page.tsx",
  "src/app/dashboard/sales/page.tsx",
  "src/app/dashboard/verifications/page.tsx",
  "src/app/dashboard/certificates/page.tsx",
  "src/app/dashboard/certificates/[id]/page.tsx",
  "src/app/dashboard/certificates/[id]/pdf/route.ts",
  "src/app/dashboard/webhooks/page.tsx",
  "src/app/dashboard/integrations/page.tsx",
  "src/app/api/v1/embed-tokens/route.ts",
  "public/widget.js",
  "src/lib/webhook-delivery.ts",
  "scripts/run-webhook-worker.mjs",
];

for (const file of requiredFiles) {
  assert.equal(existsSync(file), true, `${file} is missing`);
}

const runbook = readFileSync("DEMO_RUNBOOK.md", "utf8");
for (const phrase of [
  "Do not use `db push`",
  "npm run db:migrate:deploy",
  "npm run setup:demo",
  "POST /api/v1/sales/intake",
  "/dashboard/certificates/[id]/pdf",
  "npm run webhook:worker -- --dry-run",
  "POST /api/v1/embed-tokens",
  "x-api-key stays server-side only",
]) {
  assert.equal(runbook.includes(phrase), true, `runbook missing ${phrase}`);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["setup:demo"], "node scripts/setup-demo.mjs");
assert.equal(packageJson.scripts["test:demo-flow"], "node scripts/verify-demo-flow.mjs");

const setupDemo = readFileSync("scripts/setup-demo.mjs", "utf8");
assert.equal(setupDemo.includes("deleteMany"), false);
assert.equal(setupDemo.includes("db push"), false);
assert.equal(setupDemo.includes("reset"), false);
assert.equal(setupDemo.includes("console.log(rawApiKey"), false);
assert.equal(setupDemo.includes("DEMO_API_KEY"), true);

const certificatePdfRoute = readFileSync(
  "src/app/dashboard/certificates/[id]/pdf/route.ts",
  "utf8"
);
assert.equal(certificatePdfRoute.includes("requireDashboardRole"), true);
assert.equal(certificatePdfRoute.includes("application/pdf"), true);
assert.equal(certificatePdfRoute.includes("no-store"), true);

const widgetSource = readFileSync("public/widget.js", "utf8");
assert.equal(widgetSource.includes("x-api-key"), false);
assert.equal(widgetSource.includes("data-embed-token"), true);

const forbiddenDocs = [
  "apiKeyHash",
  "tokenHash",
  "encryptedAccountNumber",
  "full certificateJson",
  "raw webhook payload",
];
for (const sensitive of forbiddenDocs) {
  assert.equal(
    runbook.includes(`DEMO_${sensitive}`),
    false,
    `runbook appears to use sensitive placeholder ${sensitive}`
  );
}

console.log("Demo flow readiness verification passed.");
