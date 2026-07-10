#!/usr/bin/env node
// Verifies protected dashboard certificate detail view model safety.

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

const certificatesModule = loadTsModule("src/lib/dashboard-certificates.ts", {
  "@/lib/db": { db: {} },
  "@/lib/dashboard-performance": { nowMs: () => 0, logDashboardTiming: () => {} },
});
const clientPolicyModule = loadTsModule("src/lib/client-policy.ts", {
  "@/lib/db": { db: {} },
});
const saleEvidenceDisplay = loadTsModule("src/lib/sale-evidence-display.ts");
const detailModule = loadTsModule("src/lib/dashboard-certificate-detail.ts", {
  "@/lib/db": { db: {} },
  "@/lib/dashboard-auth": {},
  "@/lib/dashboard-certificates": certificatesModule,
  "@/lib/client-policy": clientPolicyModule,
  "@/lib/sale-evidence-display": saleEvidenceDisplay,
});
const rolePolicy = loadTsModule("src/lib/dashboard-role-policy.ts");

const proofHash =
  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const orgAContext = {
  user: { id: "user_a" },
  organization: { id: "org_a" },
  membership: { role: "COMPLIANCE_VIEWER" },
};
const orgBContext = {
  user: { id: "user_b" },
  organization: { id: "org_b" },
  membership: { role: "OWNER" },
};

const certificate = {
  id: "cert_a",
  organizationId: "org_a",
  proofHash,
  createdAt: new Date("2026-05-26T10:20:00.000Z"),
  certificateJson: {
    _version: "1",
    customer_name: "Sensitive Customer",
    customer_email: "private@example.com",
    customer_phone: "+447700900000",
    customer_address: "1 Private Street",
    ip_address: "203.0.113.10",
    user_agent: "Sensitive user agent",
    direct_debit_bank_name: "Private Bank",
    direct_debit_sort_code: "12-34-56",
    direct_debit_account_last4: "6789",
    direct_debit_account_holder: "Sensitive Customer",
    encryptedAccountNumber: "must-not-return",
    tokenHash: "must-not-return",
    apiKeyHash: "must-not-return",
    terms_acknowledged: true,
    policies_acknowledged: true,
    cooling_off_acknowledged: true,
    direct_debit_authorised: true,
    evidence_storage_acknowledged: true,
    typed_name: "Sensitive Customer",
  },
  verificationSession: {
    id: "session_a",
    status: "COMPLETED",
    createdAt: new Date("2026-05-26T10:00:00.000Z"),
    expiresAt: new Date("2026-05-27T10:00:00.000Z"),
    completedAt: new Date("2026-05-26T10:15:00.000Z"),
    declinedAt: null,
    consentEvents: [
      {
        eventType: "CUSTOMER_OPENED",
        createdAt: new Date("2026-05-26T10:05:00.000Z"),
        ipAddress: "203.0.113.11",
        userAgent: "Do not return",
      },
    ],
    sale: {
      id: "sale_a",
      clientReference: "CRM-123",
      productName: "Verified Product",
      productPrice: { toString: () => "49.99" },
      productFrequency: "monthly",
      productTerms: "Terms shown to customer",
      productPolicies: "Policies shown to customer",
      policySnapshot: null,
      salesChannel: "phone",
      coolingOffDays: 14,
      status: "CONSENT_CONFIRMED",
      customerName: "Sensitive Customer",
      customerPhone: "+447700900000",
      customerEmail: "private@example.com",
      customerAddress: "1 Private Street",
      encryptedAccountNumber: "must-not-return",
      client: { name: "Acme Telecom Ltd" },
      submittedByUser: { name: "Seller One", email: "seller1@example.com" },
    },
  },
};

function createMockPrisma() {
  const calls = [];

  return {
    calls,
    certificate: {
      async findFirst(args) {
        calls.push(args);
        const orgId =
          args.where.verificationSession.sale.client.organizationId;
        if (args.where.id === certificate.id && orgId === certificate.organizationId) {
          return certificate;
        }
        return null;
      },
    },
  };
}

assert.equal(
  rolePolicy.roleCanAccessDashboardSection("PLATFORM_ADMIN", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("CLIENT_OWNER", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("CLIENT_MANAGER", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("OWNER", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("ADMIN", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("MANAGER", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("COMPLIANCE_VIEWER", "certificates"),
  true
);
assert.equal(
  rolePolicy.roleCanAccessDashboardSection("SELLER", "certificates"),
  true
);

assert.equal(detailModule.maskSortCodeForDashboard("12-34-56"), "**-**-56");
assert.equal(detailModule.maskSortCodeForDashboard(""), null);

const prisma = createMockPrisma();
const detail = await detailModule.getDashboardCertificateDetail(
  orgAContext,
  "cert_a",
  prisma
);

assert.equal(detail.id, "cert_a");
assert.equal(detail.proofHash, proofHash);
assert.equal(detail.proofHashFingerprint, "abcdef123456...7890");
assert.equal(detail.sale.clientReference, "CRM-123");
assert.equal(detail.sale.termsSummary, "Terms shown to customer");
assert.equal(detail.paymentSummary.accountEnding, "Account ending 6789");
assert.equal(detail.paymentSummary.sortCodeMasked, "**-**-56");

// customerEmail/customerPhone/customerAddress ARE intentionally selected --
// the certificate detail view displays them (see buildCertificateDetailViewModel).
const selectString = JSON.stringify(prisma.calls[0].select);
assert.equal(selectString.includes("tokenHash"), false);
assert.equal(selectString.includes("apiKeyHash"), false);
assert.equal(selectString.includes("encryptedAccountNumber"), false);
assert.equal(selectString.includes("ipAddress"), false);
assert.equal(selectString.includes("userAgent"), false);

const whereString = JSON.stringify(prisma.calls[0].where);
assert.equal(whereString.includes("org_a"), true);

// customerName/Phone/Email/Address and the Direct Debit bank name/account
// holder name ARE intentionally part of the certificate detail view model
// (and the PDF) -- this is the compliance evidence record and is expected
// to show who/what it covers. The customer's IP and user-agent are
// deliberately masked/summarized (see maskIpAddressForDashboard /
// summarizeUserAgentForDashboard) rather than shown raw or omitted --
// enough detail for dispute evidence without exposing full PII. The
// unmasked sort code, raw IP/user-agent, and raw secret fields must never
// appear.
assert.equal(detail.verification.customerIpAddress, "203.0.113.xxx");
assert.equal(
  detail.verification.customerUserAgent,
  "an unknown browser on an unknown device"
);

const serialized = JSON.stringify(detail);
for (const sensitive of [
  "certificateJson",
  "203.0.113.10",
  "Sensitive user agent",
  "12-34-56",
  "encryptedAccountNumber",
  "tokenHash",
  "apiKeyHash",
  "must-not-return",
]) {
  assert.equal(serialized.includes(sensitive), false, `detail contains ${sensitive}`);
}

await assert.rejects(
  () =>
    detailModule.getDashboardCertificateDetail(
      orgBContext,
      "cert_a",
      createMockPrisma()
    ),
  detailModule.DashboardCertificateDetailNotFoundError
);

await assert.rejects(
  () =>
    detailModule.getDashboardCertificateDetail(
      orgAContext,
      "missing_cert",
      createMockPrisma()
    ),
  detailModule.DashboardCertificateDetailNotFoundError
);

const pageSource = readFileSync(
  "src/app/dashboard/certificates/[id]/page.tsx",
  "utf8"
);
assert.equal(pageSource.includes("DashboardRoleGate section=\"certificates\""), true);
assert.equal(pageSource.includes("certificateJson"), false);
assert.equal(pageSource.includes("Download PDF"), true);
assert.equal(pageSource.includes("Export certificate"), false);
assert.equal(pageSource.includes("Export all"), false);

console.log("Dashboard certificate detail verification passed.");
