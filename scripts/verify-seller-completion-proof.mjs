#!/usr/bin/env node
// Verifies seller-owned sale completion wiring without using secrets or a live DB.

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

const validation = loadTsModule("src/lib/validation.ts");
const policy = loadTsModule("src/lib/dashboard-role-policy.ts");

const intakePayload = {
  client_reference: "SELLER-PROOF-001",
  seller_email: " seller1@testtelecom.local ",
  customer: {
    full_name: "Proof Customer",
    phone: "07123456789",
    email: "proof-customer@example.com",
    address: "1 Proof Street",
  },
  product: {
    name: "Proof Broadband",
    subscription_price: "29.99",
    subscription_frequency: "monthly",
    subscription_terms_summary: "12 month proof terms",
    policies_summary: "Standard proof policies",
  },
  direct_debit: {
    bank_name: "Proof Bank",
    sort_code: "12-34-56",
    account_number: "12345678",
    account_holder_name: "Proof Customer",
  },
};

const parsedIntake = validation.saleIntakeSchema.safeParse(intakePayload);
assert.equal(parsedIntake.success, true, "Seller proof intake payload must validate.");
assert.equal(parsedIntake.data.seller_email, "seller1@testtelecom.local");

const parsedCompletion = validation.completeVerificationSchema.safeParse({
  confirm_details_correct: true,
  confirm_product_price_frequency: true,
  confirm_terms: true,
  confirm_policies: true,
  confirm_cooling_off: true,
  authorise_direct_debit: true,
  confirm_evidence_storage: true,
  typed_name: "Proof Customer",
});
assert.equal(parsedCompletion.success, true, "Completion payload must validate.");

const intakeSource = readFileSync("src/app/api/v1/sales/intake/route.ts", "utf8");
assert.match(intakeSource, /resolveSubmittedByUserId/);
assert.match(intakeSource, /sellerEmail: data\.seller_email/);
assert.match(intakeSource, /where: \{ organizationId \}/);
assert.match(intakeSource, /submittedByUserId,/);
assert.match(intakeSource, /"seller_email is not valid for this organization"/);
assert.ok(
  intakeSource.indexOf("resolveSubmittedByUserId") < intakeSource.indexOf("db.sale.create"),
  "Seller ownership must be resolved before sale creation."
);

const completeSource = readFileSync(
  "src/app/api/v1/verification-sessions/[token]/complete/route.ts",
  "utf8"
);
assert.match(completeSource, /data: \{ status: "COMPLETED", completedAt \}/);
assert.match(completeSource, /data: \{ status: "VERIFIED" \}/);
assert.match(completeSource, /tx\.certificate\.create/);
assert.match(completeSource, /certificate_id: cert\.id/);
assert.doesNotMatch(completeSource, /encryptedAccountNumber:\s*true/);
assert.doesNotMatch(completeSource, /tokenHash:\s*true/);

const mySalesSource = readFileSync("src/app/dashboard/my-sales/page.tsx", "utf8");
assert.match(mySalesSource, /submittedByUserId: userId/);
assert.match(mySalesSource, /client:\s*\{\s*organizationId/s);
assert.match(mySalesSource, /verificationSessions:\s*\{/);
assert.match(mySalesSource, /status: true/);
assert.match(mySalesSource, /saleStatus: sale\.status/);
assert.match(mySalesSource, /verificationStatus: sale\.verificationSessions\[0\]\?\.status/);
assert.doesNotMatch(mySalesSource, /directDebitMandate/);
assert.doesNotMatch(mySalesSource, /certificateJson/);
assert.doesNotMatch(mySalesSource, /encryptedAccountNumber/);
assert.doesNotMatch(mySalesSource, /tokenHash/);
assert.doesNotMatch(mySalesSource, /apiKeyHash/);

for (const blockedSection of [
  "sales",
  "verifications",
  "certificates",
  "staff",
  "api-keys",
  "webhooks",
  "integrations",
  "clients",
  "settings",
]) {
  assert.equal(
    policy.roleCanAccessDashboardSection("SELLER", blockedSection),
    false,
    `SELLER must remain blocked from ${blockedSection}.`
  );
}

assert.equal(policy.roleCanAccessDashboardSection("SELLER", "my-sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "sales"), true);
assert.equal(policy.roleCanAccessDashboardSection("CLIENT_OWNER", "verifications"), true);

console.log("Seller completion proof wiring verification passed.");
