#!/usr/bin/env node
// Verifies platform-admin API key provisioning for selected client organizations.

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
const apiKeys = loadTsModule("src/lib/dashboard-api-keys.ts", {
  "@/lib/db": {
    db: {
      apiKey: {},
      client: {},
      organization: {},
    },
  },
  "@/lib/crypto": {
    hashValue: async (value) => `hash:${value}`,
    hashToken: (value) => `lookup:${value}`,
  },
  "@/lib/dashboard-performance": { nowMs: () => 0, logDashboardTiming: () => {} },
});

assert.equal(policy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "api-keys"), true);
assert.equal(policy.roleCanAccessDashboardSection("OWNER", "api-keys"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "api-keys"), false);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_MANAGER", "api-keys"), false);
assert.equal(policy.roleCanAccessDashboardSection("SELLER", "api-keys"), false);
assert.equal(policy.roleCanAccessDashboardSection("COMPLIANCE_VIEWER", "api-keys"), false);

assert.equal(apiKeys.canManageDashboardApiKeys("PLATFORM_ADMIN"), true);
assert.equal(apiKeys.canManageDashboardApiKeys("OWNER"), true);
assert.equal(apiKeys.canManageDashboardApiKeys("CLIENT_OWNER"), false);

const context = {
  user: { id: "platform-user" },
  organization: { id: "platform-org" },
  membership: { role: "PLATFORM_ADMIN" },
};

const createdCalls = [];
const mockPrisma = {
  organization: {
    findUnique: async ({ where }) =>
      where.id === "client-org" ? { id: "client-org" } : null,
    findMany: async () => [],
  },
  client: {
    findFirst: async ({ where }) =>
      where.id === "client-1" && where.organizationId === "client-org"
        ? { id: "client-1" }
        : null,
    findMany: async () => [],
  },
  apiKey: {
    create: async ({ data }) => {
      createdCalls.push(data);
      return {
        id: "api-key-1",
        name: data.name,
        keyPrefix: data.keyPrefix,
      };
    },
    count: async () => 0,
    findMany: async () => [],
  },
};

const created = await apiKeys.createDashboardApiKey({
  context,
  name: "Test Telecom API key",
  organizationId: "client-org",
  clientId: "client-1",
  prisma: mockPrisma,
});

assert.equal(created.id, "api-key-1");
assert.equal(createdCalls.length, 1);
assert.equal(createdCalls[0].organizationId, "client-org");
assert.equal(createdCalls[0].clientId, "client-1");
assert.equal(createdCalls[0].createdByUserId, "platform-user");
assert.equal(createdCalls[0].apiKeyHash.startsWith("hash:"), true);
assert.notEqual(createdCalls[0].apiKeyHash, created.rawKey);

await assert.rejects(
  () =>
    apiKeys.createDashboardApiKey({
      context,
      name: "No org",
      organizationId: "missing-org",
      clientId: "client-1",
      prisma: mockPrisma,
    }),
  /Selected organization/
);

await assert.rejects(
  () =>
    apiKeys.createDashboardApiKey({
      context,
      name: "No client",
      organizationId: "client-org",
      clientId: null,
      prisma: mockPrisma,
    }),
  /Select a client/
);

await assert.rejects(
  () =>
    apiKeys.createDashboardApiKey({
      context,
      name: "Wrong client",
      organizationId: "client-org",
      clientId: "other-org-client",
      prisma: mockPrisma,
    }),
  /Selected client/
);

await assert.rejects(
  () =>
    apiKeys.createDashboardApiKey({
      context: {
        ...context,
        membership: { role: "CLIENT_OWNER" },
      },
      name: "Client owner attempt",
      organizationId: "client-org",
      clientId: "client-1",
      prisma: mockPrisma,
    }),
  /platform admin/
);

const formSource = readFileSync(
  "src/components/dashboard/ApiKeyCreateForm.tsx",
  "utf8"
);
assert.match(formSource, /name="organizationId"/);
assert.match(formSource, /name="clientId"/);
assert.match(formSource, /filteredClients/);
assert.match(formSource, /Client record/);
assert.doesNotMatch(formSource, /apiKeyHash/);
assert.doesNotMatch(formSource, /SUPABASE_SERVICE_ROLE_KEY/);

const actionSource = readFileSync(
  "src/app/dashboard/api-keys/actions.ts",
  "utf8"
);
assert.match(actionSource, /requireDashboardRole\(API_KEY_MANAGER_ROLES\)/);
assert.match(actionSource, /formData\.get\("organizationId"\)/);
assert.doesNotMatch(actionSource, /apiKeyHash/);
assert.doesNotMatch(actionSource, /SUPABASE_SERVICE_ROLE_KEY/);

const authSource = readFileSync("src/lib/auth.ts", "utf8");
assert.match(authSource, /organizationId: key\.organizationId/);
assert.match(authSource, /clientId: key\.clientId/);
assert.match(authSource, /if \(key\.client && key\.client\.organizationId !== key\.organizationId\)/);
assert.match(authSource, /legacy_client_key/);

const intakeSource = readFileSync(
  "src/app/api/v1/sales/intake/route.ts",
  "utf8"
);
assert.match(intakeSource, /seller_email is not valid for this organization/);
assert.match(intakeSource, /where: \{ organizationId \}/);

console.log("Platform API key provisioning verification passed.");
