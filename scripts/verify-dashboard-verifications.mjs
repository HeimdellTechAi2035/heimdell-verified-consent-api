#!/usr/bin/env node
// Verifies dashboard verification data is tenant-scoped, paginated, and sensitive-safe.

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

const verificationsModule = loadTsModule("src/lib/dashboard-verifications.ts", {
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

const baseDate = new Date("2026-05-26T10:00:00.000Z");

const sessions = [
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `session_a_${String(index + 1).padStart(2, "0")}`,
    organizationId: "org_a",
    saleId: `sale_a_${String(index + 1).padStart(2, "0")}`,
    status: index % 2 === 0 ? "PENDING" : "COMPLETED",
    createdAt: new Date(baseDate.getTime() + index * 1000),
    expiresAt: new Date(baseDate.getTime() + 30 * 60 * 1000 + index * 1000),
    completedAt:
      index % 2 === 0 ? null : new Date(baseDate.getTime() + index * 2000),
    declinedAt: null,
    tokenHash: "must-not-return",
    rawToken: "raw-token-must-not-return",
    verificationUrl: "https://example.com/v/raw-token-must-not-return",
    sale: {
      id: `sale_a_${String(index + 1).padStart(2, "0")}`,
      clientReference: `A-${String(index + 1).padStart(3, "0")}`,
      productName: `Product A ${index + 1}`,
      status: index % 2 === 0 ? "PENDING" : "VERIFIED",
      customerEmail: `private-${index}@example.com`,
      customerPhone: "+447700900000",
      customerAddress: "Sensitive Address",
      encryptedAccountNumber: "must-not-return",
      apiKeyHash: "must-not-return",
    },
    certificate: index % 2 === 0 ? null : { id: `cert_a_${index}` },
  })),
  {
    id: "session_b_01",
    organizationId: "org_b",
    saleId: "sale_b_01",
    status: "DECLINED",
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
    expiresAt: new Date("2026-05-26T12:30:00.000Z"),
    completedAt: null,
    declinedAt: new Date("2026-05-26T12:05:00.000Z"),
    tokenHash: "must-not-return",
    rawToken: "raw-token-must-not-return",
    verificationUrl: "https://example.com/v/raw-token-must-not-return",
    sale: {
      id: "sale_b_01",
      clientReference: "B-001",
      productName: "Product B",
      status: "DECLINED",
      customerEmail: "private-b@example.com",
      customerPhone: "+447700900001",
      customerAddress: "Sensitive Address B",
      encryptedAccountNumber: "must-not-return",
      apiKeyHash: "must-not-return",
    },
    certificate: null,
  },
];

function organizationIdFromWhere(where) {
  return where.sale?.client?.organizationId;
}

function matchesWhere(session, where) {
  const organizationId = organizationIdFromWhere(where);

  if (session.organizationId !== organizationId) {
    return false;
  }

  if (where.status && session.status !== where.status) {
    return false;
  }

  if (where.OR?.length) {
    const search = where.OR[0].saleId.contains.toLowerCase();
    return (
      session.saleId.toLowerCase().includes(search) ||
      session.sale.clientReference.toLowerCase().includes(search)
    );
  }

  return true;
}

function createMockPrisma() {
  const calls = [];

  return {
    calls,
    verificationSession: {
      async count(args) {
        calls.push(["verificationSession.count", args]);
        return sessions.filter((session) => matchesWhere(session, args.where))
          .length;
      },
      async findMany(args) {
        calls.push(["verificationSession.findMany", args]);
        return sessions
          .filter((session) => matchesWhere(session, args.where))
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(args.skip, args.skip + args.take)
          .map((session) => ({
            id: session.id,
            saleId: session.saleId,
            status: session.status,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            completedAt: session.completedAt,
            declinedAt: session.declinedAt,
            sale: {
              id: session.sale.id,
              clientReference: session.sale.clientReference,
              productName: session.sale.productName,
              status: session.sale.status,
            },
            certificate: session.certificate,
          }));
      },
    },
  };
}

assert.equal(verificationsModule.normalizeDashboardVerificationsPage(undefined), 1);
assert.equal(verificationsModule.normalizeDashboardVerificationsPage(-1), 1);
assert.equal(verificationsModule.normalizeDashboardVerificationsPage(2.8), 2);
assert.equal(
  verificationsModule.normalizeDashboardVerificationsStatus("completed"),
  "COMPLETED"
);
assert.equal(
  verificationsModule.normalizeDashboardVerificationsStatus("not-a-status"),
  null
);
assert.equal(
  verificationsModule.normalizeDashboardVerificationsSearch("x".repeat(100))
    .length,
  80
);

assert.deepEqual(
  verificationsModule.buildOrganizationVerificationsWhere({
    organizationId: "org_a",
    status: "PENDING",
    search: "A-001",
  }),
  {
    sale: { client: { organizationId: "org_a" } },
    status: "PENDING",
    OR: [
      { saleId: { contains: "A-001", mode: "insensitive" } },
      {
        sale: {
          clientReference: { contains: "A-001", mode: "insensitive" },
        },
      },
    ],
  }
);

const whereString = JSON.stringify(
  verificationsModule.buildOrganizationVerificationsWhere({
    organizationId: "org_a",
    search: "private@example.com",
  })
);
assert.equal(whereString.includes("customerEmail"), false);
assert.equal(whereString.includes("customerPhone"), false);
assert.equal(whereString.includes("customerAddress"), false);
assert.equal(whereString.includes("tokenHash"), false);

const prismaA = createMockPrisma();
const dataA = await verificationsModule.getDashboardVerificationsData(
  orgAContext,
  { page: 1 },
  prismaA
);

assert.equal(dataA.pagination.pageSize, 20);
assert.equal(dataA.rows.length, 20);
assert.equal(dataA.pagination.totalRows, 24);
assert.equal(dataA.pagination.hasNextPage, true);
assert.ok(dataA.rows.every((row) => row.clientReference.startsWith("A-")));

const findManyCall = prismaA.calls.find(
  ([name]) => name === "verificationSession.findMany"
)[1];
assert.equal(findManyCall.take, 20);
assert.equal(findManyCall.skip, 0);
assert.equal(JSON.stringify(findManyCall.where).includes("org_a"), true);

const selectString = JSON.stringify(findManyCall.select);
assert.equal(selectString.includes("tokenHash"), false);
assert.equal(selectString.includes("customerEmail"), false);
assert.equal(selectString.includes("customerPhone"), false);
assert.equal(selectString.includes("customerAddress"), false);
assert.equal(selectString.includes("encryptedAccountNumber"), false);
assert.equal(selectString.includes("apiKeyHash"), false);

const serializedA = JSON.stringify(dataA);
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

const prismaB = createMockPrisma();
const dataB = await verificationsModule.getDashboardVerificationsData(
  orgBContext,
  { page: 1 },
  prismaB
);

assert.equal(dataB.rows.length, 1);
assert.equal(dataB.rows[0].clientReference, "B-001");

const filtered = await verificationsModule.getDashboardVerificationsData(
  orgAContext,
  { page: 1, status: "COMPLETED", search: "A-002" },
  createMockPrisma()
);

assert.equal(filtered.rows.length, 1);
assert.equal(filtered.rows[0].clientReference, "A-002");
assert.equal(filtered.filters.status, "COMPLETED");
assert.equal(filtered.filters.search, "A-002");

const empty = await verificationsModule.getDashboardVerificationsData(
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
    verificationsModule.getDashboardVerificationsData(
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

console.log("Dashboard verifications verification passed.");
