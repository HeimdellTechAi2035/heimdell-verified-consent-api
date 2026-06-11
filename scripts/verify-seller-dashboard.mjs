#!/usr/bin/env node
// Verifies seller-safe dashboard landing and access boundaries.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path, mocks = {}) {
  const source = readFileSync(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const localRequire = (specifier) => mocks[specifier] ?? require(specifier);
  const execute = new Function("require", "module", "exports", transpiled);
  execute(localRequire, module, module.exports);
  return module.exports;
}

const policy = loadTsModule("src/lib/dashboard-role-policy.ts");

assert.equal(policy.roleCanAccessDashboardSection("SELLER", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_MANAGER", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("OWNER", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("ADMIN", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("MANAGER", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("COMPLIANCE_VIEWER", "my-sales"), false);

const sellerBlockedSections = [
  "overview",
  "sales",
  "verifications",
  "certificates",
  "staff",
  "clients",
  "api-keys",
  "webhooks",
  "integrations",
  "settings",
];

for (const section of sellerBlockedSections) {
  assert.equal(
    policy.roleCanAccessDashboardSection("SELLER", section),
    false,
    `SELLER should not access ${section}`
  );
}

assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "staff"), true);
assert.equal(policy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "clients"), true);
assert.equal(policy.roleCanAccessDashboardSection("OWNER", "clients"), true);
assert.equal(policy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "api-keys"), true);
assert.equal(policy.roleCanAccessDashboardSection("OWNER", "webhooks"), true);

const layoutSource = readFileSync("src/app/dashboard/layout.tsx", "utf8");
assert.match(layoutSource, /mustChangePassword/);
assert.match(layoutSource, /role === "SELLER"/);
assert.match(layoutSource, /pathname === "\/dashboard"/);
assert.match(layoutSource, /pathname === "\/dashboard\/overview"/);
assert.match(layoutSource, /redirect\("\/dashboard\/my-sales"\)/);
assert.ok(
  layoutSource.indexOf("mustChangePassword") < layoutSource.indexOf('role === "SELLER"'),
  "Forced password change must be checked before seller redirect."
);

const pageSource = readFileSync("src/app/dashboard/my-sales/page.tsx", "utf8");
assert.match(pageSource, /DashboardRoleGate section="my-sales"/);
assert.match(pageSource, /role === "SELLER"/);
assert.match(pageSource, /submittedByUserId: userId/);
assert.match(pageSource, /organizationId/);
assert.match(pageSource, /getSellerMySalesRows/);
assert.doesNotMatch(pageSource, /getDashboardSales/);
assert.doesNotMatch(pageSource, /encryptedAccountNumber/);
assert.doesNotMatch(pageSource, /tokenHash/);
assert.doesNotMatch(pageSource, /apiKeyHash/);
assert.doesNotMatch(pageSource, /certificateJson/);

const sidebarSource = readFileSync(
  "src/components/dashboard/DashboardSidebar.tsx",
  "utf8"
);
assert.match(sidebarSource, /href: "\/dashboard\/my-sales"/);
assert.match(sidebarSource, /section: "my-sales"/);

console.log("Seller dashboard verification passed.");
