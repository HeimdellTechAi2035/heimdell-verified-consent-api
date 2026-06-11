#!/usr/bin/env node
// Verifies live dashboard sales data is tenant-scoped, paginated, and sensitive-safe.

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

const salesModule = loadTsModule("src/lib/dashboard-sales.ts", {
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

const baseDate = new Date("2026-05-26T09:00:00.000Z");

const sales = [
  ...Array.from({ length: 25 }, (_, index) => ({
    id: `sale_a_${String(index + 1).padStart(2, "0")}`,
    organizationId: "org_a",
    clientReference: `A-${String(index + 1).padStart(3, "0")}`,
    productName: `Product A ${index + 1}`,
    productPrice: { toString: () => String(20 + index) },
    productFrequency: "monthly",
    status: index % 2 === 0 ? "PENDING" : "VERIFIED",
    createdAt: new Date(baseDate.getTime() + index * 1000),
    updatedAt: new Date(baseDate.getTime() + index * 2000),
    customerEmail: `private-${index}@example.com`,
    customerPhone: "+447700900000",
    customerAddress: "Sensitive Address",
    apiKeyHash: "must-not-return",
    tokenHash: "must-not-return",
    encryptedAccountNumber: "must-not-return",
    verificationSessions: [
      { status: index % 2 === 0 ? "PENDING" : "COMPLETED" },
    ],
  })),
  {
    id: "sale_b_01",
    organizationId: "org_b",
    clientReference: "B-001",
    productName: "Product B",
    productPrice: { toString: () => "99" },
    productFrequency: "monthly",
    status: "DECLINED",
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
    updatedAt: new Date("2026-05-26T12:01:00.000Z"),
    customerEmail: "private-b@example.com",
    customerPhone: "+447700900001",
    customerAddress: "Sensitive Address B",
    apiKeyHash: "must-not-return",
    tokenHash: "must-not-return",
    encryptedAccountNumber: "must-not-return",
    verificationSessions: [{ status: "DECLINED" }],
  },
];

function organizationIdFromWhere(where) {
  return where.client?.organizationId;
}

function matchesWhere(sale, where) {
  const organizationId = organizationIdFromWhere(where);

  if (sale.organizationId !== organizationId) {
    return false;
  }

  if (where.status && sale.status !== where.status) {
    return false;
  }

  if (where.OR?.length) {
    const search = where.OR[0].id.contains.toLowerCase();
    return (
      sale.id.toLowerCase().includes(search) ||
      sale.clientReference.toLowerCase().includes(search)
    );
  }

  return true;
}

function createMockPrisma() {
  const calls = [];

  return {
    calls,
    sale: {
      async count(args) {
        calls.push(["sale.count", args]);
        return sales.filter((sale) => matchesWhere(sale, args.where)).length;
      },
      async findMany(args) {
        calls.push(["sale.findMany", args]);
        return sales
          .filter((sale) => matchesWhere(sale, args.where))
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(args.skip, args.skip + args.take)
          .map((sale) => ({
            id: sale.id,
            clientReference: sale.clientReference,
            productName: sale.productName,
            productPrice: sale.productPrice,
            productFrequency: sale.productFrequency,
            status: sale.status,
            createdAt: sale.createdAt,
            updatedAt: sale.updatedAt,
            verificationSessions: sale.verificationSessions,
          }));
      },
    },
  };
}

assert.equal(salesModule.normalizeDashboardSalesPage(undefined), 1);
assert.equal(salesModule.normalizeDashboardSalesPage(-1), 1);
assert.equal(salesModule.normalizeDashboardSalesPage(2.8), 2);
assert.equal(salesModule.normalizeDashboardSalesStatus("verified"), "VERIFIED");
assert.equal(salesModule.normalizeDashboardSalesStatus("not-a-status"), null);
assert.equal(
  salesModule.normalizeDashboardSalesSearch("x".repeat(100)).length,
  80
);

assert.deepEqual(
  salesModule.buildOrganizationSalesWhere({
    organizationId: "org_a",
    status: "PENDING",
    search: "A-001",
  }),
  {
    client: { organizationId: "org_a" },
    status: "PENDING",
    OR: [
      { id: { contains: "A-001", mode: "insensitive" } },
      { clientReference: { contains: "A-001", mode: "insensitive" } },
    ],
  }
);

const whereString = JSON.stringify(
  salesModule.buildOrganizationSalesWhere({
    organizationId: "org_a",
    search: "private@example.com",
  })
);
assert.equal(whereString.includes("customerEmail"), false);
assert.equal(whereString.includes("customerPhone"), false);
assert.equal(whereString.includes("customerAddress"), false);

const prismaA = createMockPrisma();
const dataA = await salesModule.getDashboardSalesData(
  orgAContext,
  { page: 1 },
  prismaA
);

assert.equal(dataA.pagination.pageSize, 20);
assert.equal(dataA.rows.length, 20);
assert.equal(dataA.pagination.totalRows, 25);
assert.equal(dataA.pagination.hasNextPage, true);
assert.ok(dataA.rows.every((row) => row.clientReference.startsWith("A-")));

const findManyCall = prismaA.calls.find(([name]) => name === "sale.findMany")[1];
assert.equal(findManyCall.take, 20);
assert.equal(findManyCall.skip, 0);
assert.equal(JSON.stringify(findManyCall.where).includes("org_a"), true);

const serializedA = JSON.stringify(dataA);
assert.equal(serializedA.includes("apiKeyHash"), false);
assert.equal(serializedA.includes("tokenHash"), false);
assert.equal(serializedA.includes("encryptedAccountNumber"), false);
assert.equal(serializedA.includes("customerEmail"), false);
assert.equal(serializedA.includes("customerPhone"), false);
assert.equal(serializedA.includes("customerAddress"), false);
assert.equal(serializedA.includes("private-"), false);
assert.equal(serializedA.includes("+447700"), false);

const prismaB = createMockPrisma();
const dataB = await salesModule.getDashboardSalesData(
  orgBContext,
  { page: 1 },
  prismaB
);

assert.equal(dataB.rows.length, 1);
assert.equal(dataB.rows[0].clientReference, "B-001");

const prismaFiltered = createMockPrisma();
const filtered = await salesModule.getDashboardSalesData(
  orgAContext,
  { page: 1, status: "VERIFIED", search: "A-002" },
  prismaFiltered
);

assert.equal(filtered.rows.length, 1);
assert.equal(filtered.rows[0].clientReference, "A-002");
assert.equal(filtered.filters.status, "VERIFIED");
assert.equal(filtered.filters.search, "A-002");

const empty = await salesModule.getDashboardSalesData(
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
    salesModule.getDashboardSalesData(
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

console.log("Dashboard sales verification passed.");
