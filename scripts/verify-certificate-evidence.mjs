#!/usr/bin/env node
// Verifies the certificate evidence discriminated union (web vs phone_call):
// the web branch must hash byte-for-byte identically to a fixed fixture
// (guards against accidentally changing existing certificates' proof),
// and the phone branch must produce its own distinct, correctly-scoped hash.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path) {
  const source = readFileSync(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const execute = new Function("require", "module", "exports", transpiled);
  execute(require, module, module.exports);
  return module.exports;
}

const certificate = loadTsModule("src/lib/certificate.ts");

const baseSession = { id: "session_fixed_1" };
const baseSale = {
  id: "sale_fixed_1",
  clientId: "client_fixed_1",
  clientReference: "REF-1",
  agentId: "AGENT-1",
  customerName: "Jane Smith",
  customerEmail: "jane@example.com",
  customerPhone: "447700900000",
  customerAddress: "1 Example Street",
  productName: "Premium Broadband",
  productPrice: { toString: () => "49.99" },
  productFrequency: "monthly",
  productTerms: "24-month contract",
  productPolicies: "14-day cooling-off",
  salesChannel: "door_to_door",
  aiMarketingOptIn: true,
  coolingOffDays: 14,
  client: {},
  directDebitMandate: {
    bankName: "Barclays",
    sortCode: "123456",
    accountNumberLast4: "5678",
    accountHolderName: "Jane Smith",
  },
};

// --- Fixed fixture: web branch must hash to this exact known value -----
const webEvidence = {
  method: "web",
  typed_name: "Jane Smith",
  ip_address: "203.0.113.5",
  user_agent: "TestAgent/1.0",
  completed_at: new Date("2026-01-01T12:00:00.000Z"),
  terms_acknowledged: true,
  policies_acknowledged: true,
  cooling_off_acknowledged: true,
  direct_debit_authorised: true,
  evidence_storage_acknowledged: true,
  ai_consent_confirmed: false,
  confirm_details_correct: true,
  confirm_product_price_frequency: true,
};

const webResult = certificate.createCertificateJson({
  session: baseSession,
  sale: baseSale,
  evidence: webEvidence,
});

// Independently compute the reference hash over the exact canonical field
// set the pre-phone-call-evidence code always used for the web branch — if
// createCertificateJson's web branch ever drifts from this, existing
// customers' certificates would no longer verify the same way.
const referenceCanonical = {
  verification_id: baseSession.id,
  sale_id: baseSale.id,
  client_id: baseSale.clientId,
  client_reference: baseSale.clientReference,
  customer_name: baseSale.customerName,
  product_name: baseSale.productName,
  subscription_price: baseSale.productPrice.toString(),
  subscription_frequency: baseSale.productFrequency,
  direct_debit_sort_code: baseSale.directDebitMandate.sortCode,
  direct_debit_account_last4: baseSale.directDebitMandate.accountNumberLast4,
  direct_debit_authorised: webEvidence.direct_debit_authorised,
  terms_acknowledged: webEvidence.terms_acknowledged,
  policies_acknowledged: webEvidence.policies_acknowledged,
  cooling_off_acknowledged: webEvidence.cooling_off_acknowledged,
  typed_name: webEvidence.typed_name,
  completed_at: webEvidence.completed_at.toISOString(),
  sales_channel: baseSale.salesChannel,
  ai_marketing_opt_in: baseSale.aiMarketingOptIn,
  ai_consent_confirmed: webEvidence.ai_consent_confirmed,
};
const sortedReference = Object.fromEntries(
  Object.entries(referenceCanonical).sort(([a], [b]) => a.localeCompare(b))
);
const referenceHash = createHash("sha256").update(JSON.stringify(sortedReference)).digest("hex");

assert.equal(
  webResult.proofHash,
  referenceHash,
  "web certificate proofHash must match a hash computed independently over the exact pre-phone-call canonical field set"
);
assert.ok(!("call_sid" in webResult.payload), "web payload must never contain phone-only fields");
assert.equal(webResult.payload.verification_method, "web");
assert.equal(webResult.payload.typed_name, "Jane Smith");
assert.equal(webResult.payload.ip_address, "203.0.113.5");

// --- Phone branch: distinct hash, no ip/user-agent, has call fields -----
const phoneEvidence = {
  method: "phone_call",
  call_sid: "CA1234567890",
  digits_pressed: "1",
  phone_number: "447700900000",
  call_completed_at: new Date("2026-01-01T12:05:00.000Z"),
  terms_acknowledged: true,
  policies_acknowledged: true,
  cooling_off_acknowledged: true,
  direct_debit_authorised: true,
  evidence_storage_acknowledged: true,
  ai_consent_confirmed: false,
};

const phoneResult = certificate.createCertificateJson({
  session: baseSession,
  sale: baseSale,
  evidence: phoneEvidence,
});

assert.notEqual(phoneResult.proofHash, webResult.proofHash, "phone and web evidence must hash differently");
assert.equal(phoneResult.payload.verification_method, "phone_call");
assert.equal(phoneResult.payload.call_sid, "CA1234567890");
assert.equal(phoneResult.payload.digits_pressed, "1");
assert.ok(!("ip_address" in phoneResult.payload), "phone payload must never contain ip_address");
assert.ok(!("user_agent" in phoneResult.payload), "phone payload must never contain user_agent");
assert.ok(!("typed_name" in phoneResult.payload), "phone payload must never contain typed_name");

// Changing digits_pressed must change the hash (it's part of the proof).
const phoneResultDifferentDigits = certificate.createCertificateJson({
  session: baseSession,
  sale: baseSale,
  evidence: { ...phoneEvidence, digits_pressed: "2" },
});
assert.notEqual(
  phoneResultDifferentDigits.proofHash,
  phoneResult.proofHash,
  "digits_pressed must be part of the hashed canonical fields"
);

// --- Safe API summary must strip phone_number same as other PII --------
const safeSummary = certificate.mapCertificateJsonToSafeApiSummary(phoneResult.payload);
assert.ok(!("phone_number" in safeSummary), "safe API summary must strip phone_number");
assert.ok(!("ip_address" in safeSummary), "safe API summary must strip ip_address");

console.log("Certificate evidence verification passed.");
