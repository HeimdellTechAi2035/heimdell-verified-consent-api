#!/usr/bin/env node
// Verifies dashboard page role gates and setup input validation fail closed.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  buildDashboardSetupInput,
  parseDashboardSetupArgs,
  validateDashboardSetupInput,
} from "./setup-dashboard-user.mjs";

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

const expectedSections = [
  "overview",
  "my-sales",
  "sales",
  "verifications",
  "certificates",
  "staff",
  "clients",
  "api-keys",
  "webhooks",
  "settings",
  "integrations",
  "notifications",
];

assert.deepEqual(policy.DASHBOARD_SECTIONS, expectedSections);

const expectedMatrix = {
  overview: [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
    "COMPLIANCE_VIEWER",
  ],
  "my-sales": [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
    "SELLER",
  ],
  sales: [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
  ],
  verifications: [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
  ],
  certificates: [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "COMPLIANCE_VIEWER",
    "OWNER",
    "ADMIN",
    "MANAGER",
  ],
  staff: ["PLATFORM_ADMIN", "CLIENT_OWNER", "OWNER", "ADMIN"],
  clients: ["PLATFORM_ADMIN", "OWNER"],
  "api-keys": ["PLATFORM_ADMIN", "OWNER"],
  webhooks: ["PLATFORM_ADMIN", "OWNER"],
  settings: ["PLATFORM_ADMIN", "CLIENT_OWNER", "OWNER", "ADMIN"],
  integrations: ["PLATFORM_ADMIN", "OWNER"],
  notifications: ["PLATFORM_ADMIN", "CLIENT_OWNER", "OWNER", "ADMIN"],
};
const allRoles = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
];

for (const section of expectedSections) {
  assert.deepEqual(
    [...policy.getAllowedDashboardRoles(section)],
    expectedMatrix[section]
  );

  for (const role of allRoles) {
    assert.equal(
      policy.roleCanAccessDashboardSection(role, section),
      expectedMatrix[section].includes(role),
      `${role} access mismatch for ${section}`
    );
  }
}

assert.deepEqual(policy.getAllowedDashboardRoles("unknown-section"), []);
assert.equal(
  policy.roleCanAccessDashboardSection("OWNER", "unknown-section"),
  false
);

const parsed = parseDashboardSetupArgs([
  "--org-name",
  "Acme",
  "--org-slug=acme",
  "--email",
  "admin@example.com",
  "--external-auth-id",
  "auth-user-1",
  "--role",
  "admin",
  "--link-dev-client",
]);

assert.equal(parsed.organizationName, "Acme");
assert.equal(parsed.organizationSlug, "acme");
assert.equal(parsed.email, "admin@example.com");
assert.equal(parsed.externalAuthId, "auth-user-1");
assert.equal(parsed.role, "admin");
assert.equal(parsed.linkDevClient, true);

assert.ok(
  validateDashboardSetupInput(
    buildDashboardSetupInput(
      {},
      [
        "--org-name",
        "Acme",
        "--org-slug",
        "acme",
        "--email",
        "admin@example.com",
        "--external-auth-id",
        "auth-user-1",
        "--role",
        "CLIENT_OWNER",
      ]
    )
  ).length === 0
);

assert.ok(
  validateDashboardSetupInput(
    buildDashboardSetupInput({}, ["--email", "admin@example.com"])
  ).length > 0
);

assert.ok(
  validateDashboardSetupInput(
    buildDashboardSetupInput(
      {},
      [
        "--org-name",
        "Acme",
        "--org-slug",
        "acme",
        "--email",
        "admin@example.com",
        "--external-auth-id",
        "auth-user-1",
        "--role",
        "SUPERADMIN",
      ]
    )
  ).length > 0
);

assert.ok(
  validateDashboardSetupInput(
    buildDashboardSetupInput(
      {},
      [
        "--org-name",
        "Acme",
        "--org-slug",
        "acme",
        "--email",
        "admin@example.com",
        "--external-auth-id",
        "auth-user-1",
        "--role",
        "ADMIN",
        "--client-id",
        "client_1",
        "--client-name",
        "Acme Broadband",
      ]
    )
  ).length > 0
);

console.log("Dashboard access setup verification passed.");
