#!/usr/bin/env node
// Verifies seller ownership tracking stays tenant-scoped and backward-compatible.

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

const basePayload = {
  client_reference: "sale-ref-001",
  customer: {
    full_name: "Demo Customer",
    phone: "07123456789",
    email: "customer@example.com",
    address: "1 Demo Street",
  },
  product: {
    name: "Demo Broadband",
    subscription_price: "29.99",
    subscription_frequency: "monthly",
    subscription_terms_summary: "12 month term",
    policies_summary: "Standard cancellation policy",
  },
  direct_debit: {
    bank_name: "Demo Bank",
    sort_code: "12-34-56",
    account_number: "12345678",
    account_holder_name: "Demo Customer",
  },
};

const oldPayload = validation.saleIntakeSchema.safeParse(basePayload);
assert.equal(oldPayload.success, true, "Old intake payload without seller_email must remain valid.");

const sellerPayload = validation.saleIntakeSchema.safeParse({
  ...basePayload,
  seller_email: " SELLER@EXAMPLE.COM ",
});
assert.equal(sellerPayload.success, true, "seller_email payload must be valid.");
assert.equal(sellerPayload.data.seller_email, "seller@example.com");

const invalidSellerPayload = validation.saleIntakeSchema.safeParse({
  ...basePayload,
  seller_email: "not-an-email",
});
assert.equal(invalidSellerPayload.success, false);

const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schemaSource, /submittedByUserId String\?/);
assert.match(schemaSource, /submittedByUser\s+User\?\s+@relation\("SaleSubmittedBy"/);
assert.match(schemaSource, /submittedSales Sale\[\]\s+@relation\("SaleSubmittedBy"\)/);
assert.match(schemaSource, /@@index\(\[submittedByUserId\]\)/);
assert.match(schemaSource, /agentId\s+String\?/);

const migrationSource = readFileSync(
  "prisma/migrations/20260602002000_add_sale_submitted_by_user/migration.sql",
  "utf8"
);
assert.match(migrationSource, /ADD COLUMN "submittedByUserId" TEXT/);
assert.match(migrationSource, /FOREIGN KEY \("submittedByUserId"\) REFERENCES "User"\("id"\)/);
assert.match(migrationSource, /CREATE INDEX "Sale_submittedByUserId_idx"/);

const intakeSource = readFileSync(
  "src/app/api/v1/sales/intake/route.ts",
  "utf8"
);
assert.match(intakeSource, /SALE_OWNER_ROLES/);
assert.match(intakeSource, /"SELLER"/);
assert.match(intakeSource, /"CLIENT_MANAGER"/);
assert.match(intakeSource, /"CLIENT_OWNER"/);
assert.match(intakeSource, /"ADMIN"/);
assert.match(intakeSource, /"MANAGER"/);
assert.match(intakeSource, /resolveSubmittedByUserId/);
assert.match(intakeSource, /where: \{ organizationId \}/);
assert.match(intakeSource, /submittedByUserId/);
assert.match(intakeSource, /errors\.badRequest\(\s*"seller_email is not valid for this organization"/);

const resolveIndex = intakeSource.indexOf("resolveSubmittedByUserId");
const createIndex = intakeSource.indexOf("db.sale.create");
assert.ok(resolveIndex > -1 && createIndex > -1 && resolveIndex < createIndex);

const mySalesSource = readFileSync("src/app/dashboard/my-sales/page.tsx", "utf8");
assert.match(mySalesSource, /submittedByUserId: userId/);
assert.match(mySalesSource, /client:\s*\{\s*organizationId/s);
assert.match(mySalesSource, /take: 20/);
assert.doesNotMatch(mySalesSource, /directDebitMandate/);
assert.doesNotMatch(mySalesSource, /tokenHash/);
assert.doesNotMatch(mySalesSource, /apiKeyHash/);
assert.doesNotMatch(mySalesSource, /certificateJson/);
assert.doesNotMatch(mySalesSource, /encryptedAccountNumber/);
assert.doesNotMatch(mySalesSource, /\/dashboard\/certificates\/\$\{/);

console.log("Sale ownership verification passed.");
