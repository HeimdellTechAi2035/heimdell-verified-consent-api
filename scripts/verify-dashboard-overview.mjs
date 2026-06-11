#!/usr/bin/env node
// Verifies live dashboard overview data is tenant-scoped and sensitive-safe.

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

const overview = loadTsModule("src/lib/dashboard-overview.ts", {
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

const sales = [
  {
    id: "sale_a1",
    organizationId: "org_a",
    clientReference: "A-001",
    productName: "Safe Product A",
    customerEmail: "private-a@example.com",
    encryptedAccountNumber: "v1:secret",
  },
  {
    id: "sale_b1",
    organizationId: "org_b",
    clientReference: "B-001",
    productName: "Safe Product B",
    customerEmail: "private-b@example.com",
    encryptedAccountNumber: "v1:secret",
  },
];

const sessions = [
  {
    id: "session_a_pending",
    organizationId: "org_a",
    saleId: "sale_a1",
    status: "PENDING",
    createdAt: new Date("2026-05-25T10:00:00.000Z"),
    openedAt: null,
    completedAt: null,
    declinedAt: null,
    tokenHash: "must-not-return",
  },
  {
    id: "session_a_completed",
    organizationId: "org_a",
    saleId: "sale_a1",
    status: "COMPLETED",
    createdAt: new Date("2026-05-25T11:00:00.000Z"),
    openedAt: new Date("2026-05-25T11:01:00.000Z"),
    completedAt: new Date("2026-05-25T11:05:00.000Z"),
    declinedAt: null,
    tokenHash: "must-not-return",
  },
  {
    id: "session_b_declined",
    organizationId: "org_b",
    saleId: "sale_b1",
    status: "DECLINED",
    createdAt: new Date("2026-05-25T12:00:00.000Z"),
    openedAt: null,
    completedAt: null,
    declinedAt: new Date("2026-05-25T12:05:00.000Z"),
    tokenHash: "must-not-return",
  },
];

const certificates = [
  { id: "cert_a1", organizationId: "org_a", proofHash: "safe-proof-hash" },
  { id: "cert_b1", organizationId: "org_b", proofHash: "safe-proof-hash" },
];

function organizationIdFromWhere(where) {
  return (
    where.client?.organizationId ??
    where.sale?.client?.organizationId ??
    where.verificationSession?.sale?.client?.organizationId
  );
}

function createMockPrisma() {
  const calls = [];

  return {
    calls,
    sale: {
      async count(args) {
        calls.push(["sale.count", args]);
        const organizationId = organizationIdFromWhere(args.where);
        return sales.filter((sale) => sale.organizationId === organizationId)
          .length;
      },
    },
    verificationSession: {
      async count(args) {
        calls.push(["verificationSession.count", args]);
        const organizationId = organizationIdFromWhere(args.where);
        return sessions.filter(
          (session) =>
            session.organizationId === organizationId &&
            (!args.where.status || session.status === args.where.status)
        ).length;
      },
      async findMany(args) {
        calls.push(["verificationSession.findMany", args]);
        const organizationId = organizationIdFromWhere(args.where);
        return sessions
          .filter((session) => session.organizationId === organizationId)
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, args.take)
          .map((session) => {
            const sale = sales.find((item) => item.id === session.saleId);
            return {
              id: session.id,
              status: session.status,
              createdAt: session.createdAt,
              openedAt: session.openedAt,
              completedAt: session.completedAt,
              declinedAt: session.declinedAt,
              sale: {
                clientReference: sale.clientReference,
                productName: sale.productName,
              },
            };
          });
      },
    },
    certificate: {
      async count(args) {
        calls.push(["certificate.count", args]);
        const organizationId = organizationIdFromWhere(args.where);
        return certificates.filter((cert) => cert.organizationId === organizationId)
          .length;
      },
    },
  };
}

assert.deepEqual(overview.buildOrganizationSaleWhere("org_a"), {
  client: { organizationId: "org_a" },
});

assert.deepEqual(overview.buildOrganizationVerificationWhere("org_a", "PENDING"), {
  status: "PENDING",
  sale: { client: { organizationId: "org_a" } },
});

assert.deepEqual(overview.buildOrganizationCertificateWhere("org_a"), {
  verificationSession: { sale: { client: { organizationId: "org_a" } } },
});

const prismaA = createMockPrisma();
const dataA = await overview.getDashboardOverviewData(orgAContext, prismaA);

assert.equal(dataA.metrics.totalSales, 1);
assert.equal(dataA.metrics.pendingVerifications, 1);
assert.equal(dataA.metrics.completedVerifications, 1);
assert.equal(dataA.metrics.declinedVerifications, 0);
assert.equal(dataA.metrics.certificatesIssued, 1);
assert.equal(dataA.metrics.recentVerificationActivity, 2);
assert.equal(dataA.metrics.completionRate, 50);
assert.ok(dataA.recentActivity.every((row) => row.clientReference.startsWith("A-")));

const serializedA = JSON.stringify(dataA);
assert.equal(serializedA.includes("tokenHash"), false);
assert.equal(serializedA.includes("apiKeyHash"), false);
assert.equal(serializedA.includes("encryptedAccountNumber"), false);
assert.equal(serializedA.includes("private-a@example.com"), false);
assert.equal(serializedA.includes("must-not-return"), false);

for (const [, args] of prismaA.calls) {
  assert.equal(
    JSON.stringify(args.where).includes("org_a"),
    true,
    "every overview query must include the authenticated organization id"
  );
}

const prismaB = createMockPrisma();
const dataB = await overview.getDashboardOverviewData(orgBContext, prismaB);

assert.equal(dataB.metrics.totalSales, 1);
assert.equal(dataB.metrics.pendingVerifications, 0);
assert.equal(dataB.metrics.declinedVerifications, 1);
assert.ok(dataB.recentActivity.every((row) => row.clientReference.startsWith("B-")));

const emptyPrisma = createMockPrisma();
const emptyData = await overview.getDashboardOverviewData(
  {
    user: { id: "user_empty" },
    organization: { id: "org_empty", name: "Empty Org" },
    membership: { role: "OWNER" },
  },
  emptyPrisma
);

assert.equal(emptyData.metrics.totalSales, 0);
assert.equal(emptyData.metrics.completionRate, 0);
assert.deepEqual(emptyData.recentActivity, []);

await assert.rejects(
  () =>
    overview.getDashboardOverviewData(
      {
        user: { id: "user_missing" },
        organization: { id: "", name: "Missing Org" },
        membership: { role: "OWNER" },
      },
      createMockPrisma()
    ),
  /requires organization context/
);

console.log("Dashboard overview verification passed.");
