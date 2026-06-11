#!/usr/bin/env node
// Verifies dashboard certificate metadata is tenant-scoped, paginated, and sensitive-safe.

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

const orgAContext = {
  user: { id: "user_a" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "OWNER" },
};

const orgBContext = {
  user: { id: "user_b" },
  organization: { id: "org_b", name: "Org B" },
  membership: { role: "OWNER" },
};

const baseDate = new Date("2026-05-26T13:00:00.000Z");
const longHash = "abcdef1234567890abcdef1234567890abcdef1234567890";

const certificates = [
  ...Array.from({ length: 23 }, (_, index) => ({
    id: `cert_a_${String(index + 1).padStart(2, "0")}`,
    organizationId: "org_a",
    verificationSessionId: `session_a_${String(index + 1).padStart(2, "0")}`,
    proofHash: `${longHash}${index}`,
    certificateJson: {
      customerEmail: `private-${index}@example.com`,
      fullUserAgent: "Sensitive user agent",
      ipAddress: "203.0.113.10",
    },
    createdAt: new Date(baseDate.getTime() + index * 1000),
    verificationSession: {
      id: `session_a_${String(index + 1).padStart(2, "0")}`,
      saleId: `sale_a_${String(index + 1).padStart(2, "0")}`,
      status: "COMPLETED",
      completedAt: new Date(baseDate.getTime() + index * 2000),
      tokenHash: "must-not-return",
      verificationUrl: "https://example.com/v/raw-token-must-not-return",
      sale: {
        id: `sale_a_${String(index + 1).padStart(2, "0")}`,
        clientReference: `A-${String(index + 1).padStart(3, "0")}`,
        productName: `Product A ${index + 1}`,
        status: "VERIFIED",
        customerEmail: `private-${index}@example.com`,
        customerPhone: "+447700900000",
        customerAddress: "Sensitive Address",
        encryptedAccountNumber: "must-not-return",
        apiKeyHash: "must-not-return",
      },
    },
  })),
  {
    id: "cert_b_01",
    organizationId: "org_b",
    verificationSessionId: "session_b_01",
    proofHash: longHash,
    certificateJson: { customerEmail: "private-b@example.com" },
    createdAt: new Date("2026-05-26T14:00:00.000Z"),
    verificationSession: {
      id: "session_b_01",
      saleId: "sale_b_01",
      status: "COMPLETED",
      completedAt: new Date("2026-05-26T14:01:00.000Z"),
      tokenHash: "must-not-return",
      verificationUrl: "https://example.com/v/raw-token-must-not-return",
      sale: {
        id: "sale_b_01",
        clientReference: "B-001",
        productName: "Product B",
        status: "VERIFIED",
        customerEmail: "private-b@example.com",
        customerPhone: "+447700900001",
        customerAddress: "Sensitive Address B",
        encryptedAccountNumber: "must-not-return",
        apiKeyHash: "must-not-return",
      },
    },
  },
];

function organizationIdFromWhere(where) {
  return where.verificationSession?.sale?.client?.organizationId;
}

function matchesDateRange(certificate, createdAt) {
  if (!createdAt) {
    return true;
  }

  if (createdAt.gte && certificate.createdAt < createdAt.gte) {
    return false;
  }

  if (createdAt.lte && certificate.createdAt > createdAt.lte) {
    return false;
  }

  return true;
}

function matchesWhere(certificate, where) {
  const organizationId = organizationIdFromWhere(where);

  if (certificate.organizationId !== organizationId) {
    return false;
  }

  if (!matchesDateRange(certificate, where.createdAt)) {
    return false;
  }

  if (where.OR?.length) {
    const search =
      where.OR[0].verificationSessionId.contains.toLowerCase();
    return (
      certificate.verificationSessionId.toLowerCase().includes(search) ||
      certificate.verificationSession.saleId.toLowerCase().includes(search) ||
      certificate.verificationSession.sale.clientReference
        .toLowerCase()
        .includes(search)
    );
  }

  return true;
}

function createMockPrisma() {
  const calls = [];

  return {
    calls,
    certificate: {
      async count(args) {
        calls.push(["certificate.count", args]);
        return certificates.filter((certificate) =>
          matchesWhere(certificate, args.where)
        ).length;
      },
      async findMany(args) {
        calls.push(["certificate.findMany", args]);
        return certificates
          .filter((certificate) => matchesWhere(certificate, args.where))
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(args.skip, args.skip + args.take)
          .map((certificate) => ({
            id: certificate.id,
            verificationSessionId: certificate.verificationSessionId,
            proofHash: certificate.proofHash,
            createdAt: certificate.createdAt,
            verificationSession: {
              id: certificate.verificationSession.id,
              saleId: certificate.verificationSession.saleId,
              status: certificate.verificationSession.status,
              completedAt: certificate.verificationSession.completedAt,
              sale: {
                id: certificate.verificationSession.sale.id,
                clientReference:
                  certificate.verificationSession.sale.clientReference,
                productName: certificate.verificationSession.sale.productName,
                status: certificate.verificationSession.sale.status,
              },
            },
          }));
      },
    },
  };
}

assert.equal(certificatesModule.normalizeDashboardCertificatesPage(undefined), 1);
assert.equal(certificatesModule.normalizeDashboardCertificatesPage(-1), 1);
assert.equal(certificatesModule.normalizeDashboardCertificatesPage(2.8), 2);
assert.equal(
  certificatesModule.normalizeDashboardCertificatesSearch("x".repeat(100))
    .length,
  80
);
assert.equal(certificatesModule.normalizeDashboardCertificateDate("bad-date"), null);
assert.equal(
  certificatesModule.createProofHashFingerprint(longHash),
  "abcdef123456...7890"
);

const where = certificatesModule.buildOrganizationCertificatesWhere({
  organizationId: "org_a",
  search: "A-001",
  createdFrom: "2026-05-26T13:00:00.000Z",
  createdTo: "2026-05-26T13:30:00.000Z",
});

assert.equal(JSON.stringify(where).includes("org_a"), true);
assert.equal(JSON.stringify(where).includes("clientReference"), true);
assert.equal(JSON.stringify(where).includes("customerEmail"), false);
assert.equal(JSON.stringify(where).includes("customerPhone"), false);
assert.equal(JSON.stringify(where).includes("customerAddress"), false);
assert.equal(JSON.stringify(where).includes("certificateJson"), false);

const prismaA = createMockPrisma();
const dataA = await certificatesModule.getDashboardCertificatesData(
  orgAContext,
  { page: 1 },
  prismaA
);

assert.equal(dataA.pagination.pageSize, 20);
assert.equal(dataA.rows.length, 20);
assert.equal(dataA.pagination.totalRows, 23);
assert.equal(dataA.pagination.hasNextPage, true);
assert.ok(dataA.rows.every((row) => row.clientReference.startsWith("A-")));
assert.ok(dataA.rows.every((row) => row.proofHashFingerprint.length < longHash.length));

const findManyCall = prismaA.calls.find(
  ([name]) => name === "certificate.findMany"
)[1];
assert.equal(findManyCall.take, 20);
assert.equal(findManyCall.skip, 0);
assert.equal(JSON.stringify(findManyCall.where).includes("org_a"), true);

const selectString = JSON.stringify(findManyCall.select);
assert.equal(selectString.includes("certificateJson"), false);
assert.equal(selectString.includes("tokenHash"), false);
assert.equal(selectString.includes("customerEmail"), false);
assert.equal(selectString.includes("customerPhone"), false);
assert.equal(selectString.includes("customerAddress"), false);
assert.equal(selectString.includes("encryptedAccountNumber"), false);
assert.equal(selectString.includes("apiKeyHash"), false);

const serializedA = JSON.stringify(dataA);
assert.equal(serializedA.includes("certificateJson"), false);
assert.equal(serializedA.includes("Sensitive user agent"), false);
assert.equal(serializedA.includes("203.0.113.10"), false);
assert.equal(serializedA.includes("tokenHash"), false);
assert.equal(serializedA.includes("raw-token"), false);
assert.equal(serializedA.includes("/v/"), false);
assert.equal(serializedA.includes("apiKeyHash"), false);
assert.equal(serializedA.includes("encryptedAccountNumber"), false);
assert.equal(serializedA.includes("customerEmail"), false);
assert.equal(serializedA.includes("customerPhone"), false);
assert.equal(serializedA.includes("customerAddress"), false);
assert.equal(serializedA.includes("private-"), false);
assert.equal(serializedA.includes("+447700"), false);

const dataB = await certificatesModule.getDashboardCertificatesData(
  orgBContext,
  { page: 1 },
  createMockPrisma()
);

assert.equal(dataB.rows.length, 1);
assert.equal(dataB.rows[0].clientReference, "B-001");

const filtered = await certificatesModule.getDashboardCertificatesData(
  orgAContext,
  { page: 1, search: "A-002" },
  createMockPrisma()
);

assert.equal(filtered.rows.length, 1);
assert.equal(filtered.rows[0].clientReference, "A-002");
assert.equal(filtered.filters.search, "A-002");

const empty = await certificatesModule.getDashboardCertificatesData(
  {
    user: { id: "user_empty" },
    organization: { id: "org_empty", name: "Empty Org" },
    membership: { role: "OWNER" },
  },
  {},
  createMockPrisma()
);

assert.equal(empty.pagination.totalRows, 0);
assert.equal(empty.rows.length, 0);

await assert.rejects(
  () =>
    certificatesModule.getDashboardCertificatesData(
      {
        user: { id: "user_missing" },
        organization: { id: "", name: "Missing Org" },
        membership: { role: "OWNER" },
      },
      {},
      createMockPrisma()
    ),
  /requires organization context/
);

console.log("Dashboard certificates verification passed.");
