#!/usr/bin/env node
// Verifies client staff provisioning is tenant-scoped and fail-closed.

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
const staff = loadTsModule("src/lib/dashboard-staff.ts", {
  "@/lib/db": {
    db: {
      organizationMembership: {},
      user: {},
      $transaction: async () => {
        throw new Error("Mock transaction should not run in static verification.");
      },
    },
  },
  "@/lib/dashboard-auth": {
    requireDashboardRole: async () => ({
      organization: { id: "org_current", name: "Current Org" },
    }),
  },
  "@/lib/dashboard-role-policy": policy,
  "@/lib/dashboard-performance": {
    nowMs: () => 0,
    logDashboardTiming: () => {},
  },
});

assert.equal(policy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "staff"), true);
assert.equal(policy.roleCanAccessDashboardSection("OWNER", "staff"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "staff"), true);
assert.equal(policy.roleCanAccessDashboardSection("ADMIN", "staff"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_MANAGER", "staff"), true);
assert.equal(policy.roleCanAccessDashboardSection("SELLER", "staff"), false);
assert.equal(policy.roleCanAccessDashboardSection("COMPLIANCE_VIEWER", "staff"), false);

assert.equal(policy.roleCanAccessDashboardSection("SELLER", "api-keys"), false);
assert.equal(policy.roleCanAccessDashboardSection("SELLER", "webhooks"), false);
assert.equal(policy.roleCanAccessDashboardSection("SELLER", "integrations"), false);

assert.deepEqual([...staff.STAFF_CREATABLE_ROLES], [
  "CLIENT_MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
]);
assert.equal(staff.canCreateStaffRole("SELLER"), true);
assert.equal(staff.canCreateStaffRole("CLIENT_MANAGER"), true);
assert.equal(staff.canCreateStaffRole("COMPLIANCE_VIEWER"), true);
assert.equal(staff.canCreateStaffRole("PLATFORM_ADMIN"), false);
assert.equal(staff.canCreateStaffRole("CLIENT_OWNER"), false);
assert.equal(staff.canCreateStaffRole("OWNER"), false);
assert.equal(staff.canCreateStaffRole("ADMIN"), false);

const validInput = {
  fullName: "Sales Worker",
  email: "seller@example.com",
  temporaryPassword: "temporary-password-123",
  role: "SELLER",
};

assert.deepEqual(staff.validateStaffProvisioningInput(validInput), []);
assert.ok(
  staff.validateStaffProvisioningInput({
    ...validInput,
    role: "PLATFORM_ADMIN",
  }).length > 0
);
assert.ok(
  staff.validateStaffProvisioningInput({
    ...validInput,
    role: "CLIENT_OWNER",
  }).length > 0
);

const staffSource = readFileSync("src/lib/dashboard-staff.ts", "utf8");
assert.match(staffSource, /organizationId: context\.organization\.id/);
assert.match(staffSource, /organizationId: params\.organizationId/);
assert.match(staffSource, /mustChangePassword: true/);
assert.doesNotMatch(staffSource, /formData\.get\("organizationId"\)/);
assert.doesNotMatch(staffSource, /externalAuthId.*return/);

const actionSource = readFileSync(
  "src/app/dashboard/staff/new/actions.ts",
  "utf8"
);
assert.match(actionSource, /requireDashboardRole\(STAFF_MANAGER_ROLES\)/);
assert.match(actionSource, /organizationId: context\.organization\.id/);
assert.doesNotMatch(actionSource, /formData\.get\("organizationId"\)/);
assert.doesNotMatch(actionSource, /temporaryPassword.*console/);
assert.doesNotMatch(actionSource, /SUPABASE_SERVICE_ROLE_KEY/);

const pageSource = readFileSync("src/app/dashboard/staff/page.tsx", "utf8");
assert.match(pageSource, /DashboardRoleGate section="staff"/);
assert.doesNotMatch(pageSource, /externalAuthId/);
assert.doesNotMatch(pageSource, /apiKey/i);
assert.doesNotMatch(pageSource, /webhook/i);

const newPageSource = readFileSync("src/app/dashboard/staff/new/page.tsx", "utf8");
assert.match(newPageSource, /DashboardRoleGate section="staff"/);
assert.doesNotMatch(newPageSource, /name="organizationId"/);

const sidebarSource = readFileSync(
  "src/components/dashboard/DashboardSidebar.tsx",
  "utf8"
);
assert.match(sidebarSource, /href: "\/dashboard\/staff"/);
assert.match(sidebarSource, /section: "staff"/);

console.log("Dashboard staff provisioning verification passed.");
