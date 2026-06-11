#!/usr/bin/env node
// Minimal verification for dashboard auth access-state helpers.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadModule(path, mocks = {}) {
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

const dashboardAuth = loadModule("src/lib/dashboard-auth.ts", {
  "next/navigation": {
    redirect(path) {
      throw new Error(`redirect:${path}`);
    },
  },
  "@/lib/db": { db: {} },
  "@/lib/supabase-server": {
    createSupabaseServerClient() {
      throw new Error("Supabase should not be called by pure resolver tests");
    },
  },
});

const authz = loadModule("src/lib/authz.ts");

assert.equal(
  dashboardAuth.resolveDashboardAccessState({
    authUser: null,
    internalUser: null,
  }).status,
  "unauthenticated"
);

const missingMapping = dashboardAuth.resolveDashboardAccessState({
  authUser: { id: "supabase-user-1", email: "admin@example.com" },
  internalUser: null,
});
assert.equal(missingMapping.status, "missing_user_mapping");
assert.equal(missingMapping.externalAuthId, "supabase-user-1");

const internalUser = {
  id: "user_1",
  externalAuthId: "supabase-user-1",
  email: "admin@example.com",
  name: "Admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  memberships: [],
};

assert.equal(
  dashboardAuth.resolveDashboardAccessState({
    authUser: { id: "supabase-user-1", email: "admin@example.com" },
    internalUser,
  }).status,
  "missing_membership"
);

const organization = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const membership = {
  id: "membership_1",
  organizationId: "org_1",
  userId: "user_1",
  role: "ADMIN",
  createdAt: new Date(),
  updatedAt: new Date(),
  organization,
};

const authenticated = dashboardAuth.resolveDashboardAccessState({
  authUser: { id: "supabase-user-1", email: "admin@example.com" },
  internalUser: {
    ...internalUser,
    memberships: [membership],
  },
});

assert.equal(authenticated.status, "authenticated");
assert.equal(authenticated.context.organization.id, "org_1");
assert.equal(authenticated.context.membership.role, "ADMIN");

assert.equal(authz.canManageApiKeys("ADMIN"), true);
assert.equal(authz.canManageApiKeys("SELLER"), false);
assert.equal(authz.canViewCertificates("SELLER"), false);

console.log("Dashboard auth verification passed.");
