#!/usr/bin/env node
// Verifies platform-admin provisioning guards and password-change safety paths.

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

const PROVISIONING_EXTRA_MOCKS = {
  "@/lib/supabase-admin": {
    createSupabaseAdminClient: () => {
      throw new Error("Mock Supabase admin client should not be constructed in static verification.");
    },
  },
  "@/lib/dashboard-staff": {
    generateTemporaryStaffPassword: () => "mock-temp-password",
  },
  "@/lib/notification-providers": {
    sendEmailNotification: async () => ({ status: "skipped", reason: "mocked in static verification" }),
  },
};

const policy = loadTsModule("src/lib/dashboard-role-policy.ts");
const provisioning = loadTsModule("src/lib/dashboard-client-provisioning.ts", {
  "@/lib/db": {
    db: {
      organization: {},
      client: {},
      user: {},
      $transaction: async () => {
        throw new Error("Mock transaction should not run in static verification.");
      },
    },
  },
  "@/lib/crypto": {
    hashValue: async (value) => `hash:${value}`,
    hashToken: (value) => `lookup:${value}`,
  },
  ...PROVISIONING_EXTRA_MOCKS,
});

function loadProvisioningWithDb(db) {
  return loadTsModule("src/lib/dashboard-client-provisioning.ts", {
    "@/lib/db": { db },
    "@/lib/crypto": {
      hashValue: async (value) => `hash:${value}`,
      hashToken: (value) => `lookup:${value}`,
    },
    ...PROVISIONING_EXTRA_MOCKS,
  });
}

assert.equal(policy.roleCanAccessDashboardSection("OWNER", "clients"), true);
assert.equal(policy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "clients"), true);
assert.equal(policy.roleCanAccessDashboardSection("MANAGER", "clients"), false);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_MANAGER", "clients"), false);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "clients"), false);
assert.deepEqual([...provisioning.PLATFORM_PROVISIONING_ROLES], [
  "PLATFORM_ADMIN",
  "OWNER",
]);

const validInput = {
  organizationName: "Acme Broadband Ltd",
  organizationSlug: "acme-broadband",
  primaryContactName: "Jane Smith",
  primaryContactEmail: "jane@example.com",
  clientAdminEmail: "admin@example.com",
  temporaryPassword: "temporary-password-123",
};

assert.deepEqual(provisioning.validateClientProvisioningInput(validInput), []);
assert.equal(provisioning.normalizeSlug(" Acme Broadband Ltd! "), "acme-broadband-ltd");
assert.ok(
  provisioning.validateClientProvisioningInput({
    ...validInput,
    temporaryPassword: "short",
  }).length > 0
);
assert.ok(
  provisioning.validateClientProvisioningInput({
    ...validInput,
    organizationSlug: "Bad Slug",
  }).length > 0
);

const freshProvisioning = loadProvisioningWithDb({
  organization: {
    findUnique: async () => null,
  },
  user: {
    findUnique: async () => null,
  },
});
assert.deepEqual(
  await freshProvisioning.assertProvisioningRecordsAvailable(validInput),
  { status: "available" }
);

const activeUserProvisioning = loadProvisioningWithDb({
  organization: {
    findUnique: async () => null,
  },
  user: {
    findUnique: async () => ({
      id: "user_active",
      memberships: [{ id: "membership_active" }],
    }),
  },
});
await assert.rejects(
  () => activeUserProvisioning.assertProvisioningRecordsAvailable(validInput),
  /client_admin_active_membership/
);

const orphanUserProvisioning = loadProvisioningWithDb({
  organization: {
    findUnique: async () => null,
  },
  user: {
    findUnique: async () => ({
      id: "user_orphan",
      memberships: [],
    }),
  },
});
assert.deepEqual(
  await orphanUserProvisioning.assertProvisioningRecordsAvailable(validInput),
  { status: "reuse_internal_user", userId: "user_orphan" }
);

const provisioningSource = readFileSync(
  "src/lib/dashboard-client-provisioning.ts",
  "utf8"
);
assert.match(provisioningSource, /organizationMembership\.create/);
assert.match(provisioningSource, /organizationId: organization\.id/);
assert.match(provisioningSource, /tx\.client\.create/);
assert.match(provisioningSource, /tx\.user\.update/);
assert.match(provisioningSource, /name: `\$\{input\.organizationName\} Client`/);
assert.match(provisioningSource, /apiKeyHash: placeholderApiKeyHash/);
assert.match(provisioningSource, /generateLegacyClientPlaceholderSecret/);
assert.doesNotMatch(provisioningSource, /console\.log/);
assert.match(provisioningSource, /mustChangePassword: true/);
assert.match(provisioningSource, /membershipRole: "CLIENT_OWNER"/);
assert.match(provisioningSource, /membershipRole: "ADMIN"/);

const actionSource = readFileSync(
  "src/app/dashboard/clients/new/actions.ts",
  "utf8"
);
assert.match(actionSource, /requireDashboardRole\(PLATFORM_PROVISIONING_ROLES\)/);
assert.match(actionSource, /listUsers/);
assert.match(actionSource, /updateUserById/);
assert.match(actionSource, /client_admin_user_reused/);
assert.match(actionSource, /client_admin_auth_user_reused/);
assert.match(actionSource, /client_admin_temp_password_reset/);
assert.match(actionSource, /client_admin_email_blocked_active_membership/);
assert.match(actionSource, /provisioned=reused-user/);
assert.doesNotMatch(actionSource, /temporaryPassword.*console/);
assert.doesNotMatch(actionSource, /SUPABASE_SERVICE_ROLE_KEY/);

const adminSource = readFileSync("src/lib/supabase-admin.ts", "utf8");
assert.match(adminSource, /import "server-only"/);
assert.match(adminSource, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(adminSource, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);

const layoutSource = readFileSync("src/app/dashboard/layout.tsx", "utf8");
assert.match(layoutSource, /mustChangePassword/);
assert.match(layoutSource, /redirect\("\/dashboard\/change-password"\)/);

const changePasswordSource = readFileSync(
  "src/app/dashboard/change-password/actions.ts",
  "utf8"
);
assert.match(changePasswordSource, /signInWithPassword/);
assert.match(changePasswordSource, /updateUser/);
assert.match(changePasswordSource, /mustChangePassword: false/);

console.log("Client provisioning verification passed.");
