#!/usr/bin/env node
// Minimal verification for src/lib/authz.ts.
// Confirms the auth placeholder fails closed and role helpers do not default allow.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadAuthzModule() {
  const source = readFileSync("src/lib/authz.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const execute = new Function("module", "exports", transpiled);
  execute(module, module.exports);

  return module.exports;
}

const authz = loadAuthzModule();

const expectedRoles = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
];

assert.deepEqual(authz.ROLES, expectedRoles);

await assert.rejects(
  () => authz.requireAuthenticatedUser(),
  authz.AuthNotConfiguredError
);

const permissionMatrix = {
  PLATFORM_ADMIN: {
    canViewCertificates: true,
    canCreateVerification: true,
    canManageApiKeys: true,
    canManageWebhooks: true,
  },
  CLIENT_OWNER: {
    canViewCertificates: true,
    canCreateVerification: true,
    canManageApiKeys: false,
    canManageWebhooks: false,
  },
  CLIENT_MANAGER: {
    canViewCertificates: true,
    canCreateVerification: true,
    canManageApiKeys: false,
    canManageWebhooks: false,
  },
  OWNER: {
    canViewCertificates: true,
    canCreateVerification: true,
    canManageApiKeys: true,
    canManageWebhooks: true,
  },
  ADMIN: {
    canViewCertificates: true,
    canCreateVerification: true,
    canManageApiKeys: false,
    canManageWebhooks: false,
  },
  MANAGER: {
    canViewCertificates: true,
    canCreateVerification: true,
    canManageApiKeys: false,
    canManageWebhooks: false,
  },
  SELLER: {
    canViewCertificates: false,
    canCreateVerification: false,
    canManageApiKeys: false,
    canManageWebhooks: false,
  },
  COMPLIANCE_VIEWER: {
    canViewCertificates: true,
    canCreateVerification: false,
    canManageApiKeys: false,
    canManageWebhooks: false,
  },
};

for (const role of expectedRoles) {
  assert.equal(
    authz.canViewCertificates(role),
    permissionMatrix[role].canViewCertificates
  );
  assert.equal(
    authz.canCreateVerification(role),
    permissionMatrix[role].canCreateVerification
  );
  assert.equal(
    authz.canManageApiKeys(role),
    permissionMatrix[role].canManageApiKeys
  );
  assert.equal(
    authz.canManageWebhooks(role),
    permissionMatrix[role].canManageWebhooks
  );
}

const user = {
  id: "user_1",
  email: "user@example.com",
  memberships: [{ organizationId: "org_1", role: "CLIENT_MANAGER" }],
};

assert.equal(
  authz.requireOrganizationAccess(user, "org_1").organizationId,
  "org_1"
);
assert.throws(
  () => authz.requireOrganizationAccess(user, "org_2"),
  authz.PermissionDeniedError
);
assert.equal(
  authz.requireRole(user, "org_1", ["CLIENT_MANAGER"]).role,
  "CLIENT_MANAGER"
);
assert.throws(
  () => authz.requireRole(user, "org_1", ["PLATFORM_ADMIN", "OWNER"]),
  authz.PermissionDeniedError
);

assert.equal(authz.canManageApiKeys("SELLER"), false);
assert.equal(authz.canManageWebhooks("COMPLIANCE_VIEWER"), false);
assert.equal(authz.canCreateVerification("COMPLIANCE_VIEWER"), false);

console.log("Authz verification passed.");
