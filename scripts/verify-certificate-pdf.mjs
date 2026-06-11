#!/usr/bin/env node
// Verifies protected certificate PDF generation and route/source safety.

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
});
const detailModule = loadTsModule("src/lib/dashboard-certificate-detail.ts", {
  "@/lib/db": { db: {} },
  "@/lib/dashboard-auth": {},
  "@/lib/dashboard-certificates": certificatesModule,
});
const pdfModule = loadTsModule("src/lib/certificate-pdf.ts", {
  "@/lib/dashboard-certificate-detail": detailModule,
});
const rolePolicy = loadTsModule("src/lib/dashboard-role-policy.ts");

const proofHash =
  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const detail = {
  id: "cert_a",
  proofHash,
  proofHashFingerprint: "abcdef123456...7890",
  certificateVersion: "1",
  createdAt: "2026-05-26T10:20:00.000Z",
  sale: {
    id: "sale_a",
    clientReference: "CRM-123",
    status: "CONSENT_CONFIRMED",
    productName: "Verified Product",
    priceSummary: "49.99 / monthly",
    termsSummary: "Terms shown to customer",
    policiesSummary: "Policies shown to customer",
    coolingOffSummary: "14 day cooling-off period",
  },
  verification: {
    sessionId: "session_a",
    status: "COMPLETED",
    createdAt: "2026-05-26T10:00:00.000Z",
    completedAt: "2026-05-26T10:15:00.000Z",
    declinedAt: null,
    expiresAt: "2026-05-27T10:00:00.000Z",
  },
  confirmations: [
    { label: "Terms acknowledged", value: true },
    { label: "Policies acknowledged", value: true },
    { label: "Typed name confirmation", value: "Recorded" },
  ],
  paymentSummary: {
    accountEnding: "Account ending 6789",
    sortCodeMasked: "**-**-56",
  },
  timeline: [
    { type: "Verification session created", at: "2026-05-26T10:00:00.000Z" },
    { type: "VERIFICATION_COMPLETED", at: "2026-05-26T10:15:00.000Z" },
    { type: "Certificate created", at: "2026-05-26T10:20:00.000Z" },
  ],
};

const lines = pdfModule.buildCertificatePdfLines(detail);
const text = lines.join("\n");

assert.equal(text.includes("Heimdell Verified Consent"), true);
assert.equal(text.includes("Protected Certificate Evidence Summary"), true);
assert.equal(text.includes("Certificate ID: cert_a"), true);
assert.equal(text.includes(`Full proof hash: ${proofHash}`), true);
assert.equal(text.includes("Account ending 6789"), true);
assert.equal(text.includes("**-**-56"), true);
assert.equal(text.includes("not legal advice"), true);

for (const sensitive of [
  "tokenHash",
  "apiKeyHash",
  "encryptedAccountNumber",
  "raw-token",
  "/v/",
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "certificateJson",
  "webhookSecret",
  "203.0.113",
  "user_agent",
  "12-34-56",
  "Sensitive Customer",
]) {
  assert.equal(text.includes(sensitive), false, `PDF text contains ${sensitive}`);
}

const pdf = pdfModule.createCertificatePdf(detail);
const pdfText = Buffer.from(pdf.bytes).toString("latin1");
assert.equal(pdf.filename, "heimdell-certificate-cert_a.pdf");
assert.equal(pdfText.startsWith("%PDF-1.4"), true);
assert.equal(pdfText.includes("Heimdell Verified Consent"), true);
assert.equal(pdfText.includes(proofHash), true);
assert.equal(pdfText.includes("certificateJson"), false);
assert.equal(pdfText.includes("tokenHash"), false);

assert.equal(
  pdfModule.buildSafeCertificatePdfFilename("cert../private@example.com"),
  "heimdell-certificate-certprivateexamplecom.pdf"
);

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
  false
);

const routeSource = readFileSync(
  "src/app/dashboard/certificates/[id]/pdf/route.ts",
  "utf8"
);
assert.equal(routeSource.includes("requireDashboardRole"), true);
assert.equal(routeSource.includes("getDashboardCertificateDetail"), true);
assert.equal(routeSource.includes("Content-Type"), true);
assert.equal(routeSource.includes("application/pdf"), true);
assert.equal(routeSource.includes("Content-Disposition"), true);
assert.equal(routeSource.includes("Cache-Control"), true);
assert.equal(routeSource.includes("no-store"), true);
assert.equal(routeSource.includes("certificate.pdf_exported"), true);
assert.equal(routeSource.includes("certificateJson"), false);
assert.equal(routeSource.includes("tokenHash"), false);
assert.equal(routeSource.includes("apiKeyHash"), false);
assert.equal(routeSource.includes("encryptedAccountNumber"), false);

const pageSource = readFileSync(
  "src/app/dashboard/certificates/[id]/page.tsx",
  "utf8"
);
assert.equal(pageSource.includes("Download PDF"), true);
assert.equal(pageSource.includes("/pdf"), true);
assert.equal(pageSource.includes("email"), true);
assert.equal(pageSource.includes("Export all"), false);

console.log("Certificate PDF verification passed.");
