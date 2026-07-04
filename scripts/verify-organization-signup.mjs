#!/usr/bin/env node
// Verifies public organization-signup validation, slug-collision generation,
// rate-limit policy presence, and that pending/rejected signups can never
// leak into the normal clients list or have their applicant-submitted
// fields silently overwritten by the approval flow.

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

function loadSignupWithDb(db) {
  return loadTsModule("src/lib/organization-signup.ts", {
    "@/lib/db": { db },
    "@/lib/dashboard-client-provisioning": {
      normalizeSlug: (value) =>
        value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .replace(/-{2,}/g, "-"),
      getClientAdminAvailability: async (input) => {
        const existingUser = await db.user.findUnique({ where: { email: input.clientAdminEmail } });
        if (!existingUser) return { status: "available" };
        if (existingUser.memberships?.length > 0) {
          return { status: "blocked_active_membership", userId: existingUser.id };
        }
        return { status: "reuse_internal_user", userId: existingUser.id };
      },
    },
    "@/lib/dashboard-audit": {
      logDashboardAuditEvent: async () => {},
    },
  });
}

// --- Validation edge cases -------------------------------------------------
const validInput = {
  organizationName: "Acme Broadband Ltd",
  companiesHouseNumber: "12345678",
  icoRegistrationNumber: "ZA123456",
  businessAddress: "1 Example Street, Preston, PR1 1AA",
  primaryContactName: "Jane Smith",
  primaryContactEmail: "jane@example.com",
};

const freshSignup = loadSignupWithDb({
  organization: { findUnique: async () => null },
  user: { findUnique: async () => null },
});

assert.deepEqual(freshSignup.validateOrganizationSignupInput(validInput), []);

assert.ok(
  freshSignup.validateOrganizationSignupInput({ ...validInput, organizationName: "" }).length > 0,
  "empty company name must fail validation"
);
assert.ok(
  freshSignup.validateOrganizationSignupInput({ ...validInput, companiesHouseNumber: "!!" }).length > 0,
  "implausible Companies House number must fail validation"
);
assert.ok(
  freshSignup.validateOrganizationSignupInput({ ...validInput, icoRegistrationNumber: "" }).length > 0,
  "empty ICO number must fail validation"
);
assert.ok(
  freshSignup.validateOrganizationSignupInput({ ...validInput, primaryContactEmail: "not-an-email" }).length > 0,
  "invalid email must fail validation"
);
// Loose format check should accept realistic variant formats (Scotland/NI/LLP prefixes).
assert.deepEqual(
  freshSignup.validateOrganizationSignupInput({ ...validInput, companiesHouseNumber: "SC123456" }),
  []
);

// --- Slug generation / collision retry --------------------------------------
assert.equal(await freshSignup.generateAvailableOrganizationSlug("Acme Broadband Ltd"), "acme-broadband-ltd");

let callCount = 0;
const collidingSignup = loadSignupWithDb({
  organization: {
    findUnique: async () => {
      callCount += 1;
      return callCount <= 2 ? { id: "existing" } : null; // first two slugs taken
    },
  },
  user: { findUnique: async () => null },
});
const slug = await collidingSignup.generateAvailableOrganizationSlug("Acme Broadband Ltd");
assert.equal(slug, "acme-broadband-ltd-3", "should retry with numeric suffix on collision");

// --- Availability check reuses getClientAdminAvailability -------------------
const blockedSignup = loadSignupWithDb({
  organization: { findUnique: async () => null },
  user: {
    findUnique: async () => ({ id: "user_active", memberships: [{ id: "m1" }] }),
  },
});
assert.deepEqual(
  await blockedSignup.checkOrganizationSignupAvailability(validInput),
  { status: "blocked_active_membership" }
);

// --- createOrganizationSignup writes PENDING_APPROVAL, no other tables -----
let createCallArgs = null;
const creatingSignup = loadSignupWithDb({
  organization: {
    findUnique: async () => null,
    create: async (args) => {
      createCallArgs = args;
      return { id: "org_new", slug: args.data.slug };
    },
  },
  user: { findUnique: async () => null },
});
await creatingSignup.createOrganizationSignup(validInput);
assert.equal(createCallArgs.data.onboardingStatus, "PENDING_APPROVAL");
assert.equal(createCallArgs.data.companiesHouseNumber, validInput.companiesHouseNumber);
assert.equal(createCallArgs.data.icoRegistrationNumber, validInput.icoRegistrationNumber);

// --- Rate limit policy exists ------------------------------------------------
const rateLimitSource = readFileSync("src/lib/rate-limit.ts", "utf8");
assert.match(rateLimitSource, /publicSignupSubmit/);

// --- Source-level checks: no leakage into the normal clients list ----------
const clientSetupSource = readFileSync("src/lib/dashboard-client-setup.ts", "utf8");
assert.match(
  clientSetupSource,
  /onboardingStatus:\s*"APPROVED"/,
  "getPlatformClientSetupList must filter to APPROVED organizations only"
);

// --- Source-level check: approval update never overwrites applicant fields -
const provisioningSource = readFileSync("src/lib/dashboard-client-provisioning.ts", "utf8");
const updateBranchMatch = provisioningSource.match(
  /tx\.organization\.update\(\{[\s\S]*?data:\s*\{([\s\S]*?)\},/
);
assert.ok(updateBranchMatch, "expected an organization.update call in the provisioning transaction");
const updateDataBlock = updateBranchMatch[1];
for (const forbiddenField of ["companiesHouseNumber", "icoRegistrationNumber", "businessAddress"]) {
  assert.ok(
    !updateDataBlock.includes(forbiddenField),
    `approval update must never touch applicant-submitted field "${forbiddenField}"`
  );
}
assert.match(updateDataBlock, /onboardingStatus:\s*"APPROVED"/);
assert.match(updateDataBlock, /approvedAt/);
assert.match(updateDataBlock, /approvedByUserId/);

console.log("Organization signup verification passed.");
