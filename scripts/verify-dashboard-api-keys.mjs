#!/usr/bin/env node
// Verifies dashboard ApiKey metadata is tenant-scoped and secret-safe.

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

const apiKeysModule = loadTsModule("src/lib/dashboard-api-keys.ts", {
  "@/lib/db": { db: {} },
  "@/lib/crypto": {
    async hashValue(value) {
      return `bcrypt:${value.slice(0, 8)}`;
    },
  },
  "@/lib/dashboard-performance": {
    nowMs: () => 0,
    logDashboardTiming: () => {},
  },
});

const orgAContext = {
  user: { id: "user_a", email: "owner@example.com" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "OWNER" },
};

const orgBContext = {
  user: { id: "user_b", email: "admin@example.com" },
  organization: { id: "org_b", name: "Org B" },
  membership: { role: "PLATFORM_ADMIN" },
};

const clientOwnerContext = {
  user: { id: "user_client_owner", email: "client-owner@example.com" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "CLIENT_OWNER" },
};

const sellerContext = {
  user: { id: "user_seller", email: "seller@example.com" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "SELLER" },
};

const baseDate = new Date("2026-05-26T15:00:00.000Z");

const apiKeys = [
  ...Array.from({ length: 23 }, (_, index) => ({
    id: `key_a_${String(index + 1).padStart(2, "0")}`,
    organizationId: "org_a",
    clientId: index % 2 === 0 ? "client_a_1" : null,
    name: `Org A Key ${index + 1}`,
    keyPrefix: `hvcs_live_a_${index}`,
    apiKeyHash: "must-not-return",
    status: index % 3 === 0 ? "REVOKED" : "ACTIVE",
    lastUsedAt: index % 2 === 0 ? new Date(baseDate.getTime() + index) : null,
    expiresAt: null,
    revokedAt: index % 3 === 0 ? new Date(baseDate.getTime() + index) : null,
    createdAt: new Date(baseDate.getTime() + index * 1000),
    client:
      index % 2 === 0
        ? { id: "client_a_1", name: "Client A", apiKeyHash: "must-not-return" }
        : null,
    createdByUser: {
      id: "user_a",
      email: "owner@example.com",
      name: "Owner",
    },
  })),
  {
    id: "key_b_01",
    organizationId: "org_b",
    clientId: "client_b_1",
    name: "Org B Key",
    keyPrefix: "hvcs_live_b_1",
    apiKeyHash: "must-not-return",
    status: "ACTIVE",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2026-05-26T16:00:00.000Z"),
    client: { id: "client_b_1", name: "Client B", apiKeyHash: "must-not-return" },
    createdByUser: { id: "user_b", email: "admin@example.com", name: "Admin" },
  },
];

const clients = [
  {
    id: "client_a_1",
    organizationId: "org_a",
    name: "Client A",
    apiKeyHash: "must-not-return",
    organization: { name: "Org A" },
  },
  {
    id: "client_b_1",
    organizationId: "org_b",
    name: "Client B",
    apiKeyHash: "must-not-return",
    organization: { name: "Org B" },
  },
];

const organizations = [
  { id: "org_a", name: "Org A", slug: "org-a" },
  { id: "org_b", name: "Org B", slug: "org-b" },
];

function createMockPrisma() {
  const calls = [];
  const createdRows = [];
  const updates = [];

  return {
    calls,
    createdRows,
    updates,
    apiKey: {
      async count(args) {
        calls.push(["apiKey.count", args]);
        return apiKeys.filter((key) => key.organizationId === args.where.organizationId)
          .length;
      },
      async findMany(args) {
        calls.push(["apiKey.findMany", args]);
        return apiKeys
          .filter((key) => key.organizationId === args.where.organizationId)
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(args.skip, args.skip + args.take)
          .map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            status: key.status,
            clientId: key.clientId,
            lastUsedAt: key.lastUsedAt,
            expiresAt: key.expiresAt,
            revokedAt: key.revokedAt,
            createdAt: key.createdAt,
            client: key.client ? { id: key.client.id, name: key.client.name } : null,
            createdByUser: key.createdByUser,
          }));
      },
      async create(args) {
        calls.push(["apiKey.create", args]);
        createdRows.push(args.data);
        return {
          id: "created_key_1",
          name: args.data.name,
          keyPrefix: args.data.keyPrefix,
        };
      },
      async findFirst(args) {
        calls.push(["apiKey.findFirst", args]);
        return apiKeys.find(
          (key) =>
            key.id === args.where.id &&
            key.organizationId === args.where.organizationId
        )
          ? { id: args.where.id }
          : null;
      },
      async update(args) {
        calls.push(["apiKey.update", args]);
        updates.push(args);
        return { id: args.where.id };
      },
    },
    client: {
      async findMany(args) {
        calls.push(["client.findMany", args]);
        return clients.map((client) => ({
          id: client.id,
          name: client.name,
          organizationId: client.organizationId,
          organization: client.organization,
        }));
      },
      async findFirst(args) {
        calls.push(["client.findFirst", args]);
        return clients.find(
          (client) =>
            client.id === args.where.id &&
            client.organizationId === args.where.organizationId
        )
          ? { id: args.where.id }
          : null;
      },
    },
    organization: {
      async findMany(args) {
        calls.push(["organization.findMany", args]);
        return organizations;
      },
      async findUnique(args) {
        calls.push(["organization.findUnique", args]);
        return organizations.find((organization) => organization.id === args.where.id) ?? null;
      },
    },
  };
}

assert.equal(apiKeysModule.canManageDashboardApiKeys("OWNER"), true);
assert.equal(apiKeysModule.canManageDashboardApiKeys("PLATFORM_ADMIN"), true);
assert.equal(apiKeysModule.canManageDashboardApiKeys("ADMIN"), false);
assert.equal(apiKeysModule.canManageDashboardApiKeys("CLIENT_OWNER"), false);
assert.equal(apiKeysModule.canManageDashboardApiKeys("MANAGER"), false);
assert.equal(apiKeysModule.canManageDashboardApiKeys("SELLER"), false);
assert.equal(apiKeysModule.normalizeDashboardApiKeysPage(undefined), 1);
assert.equal(apiKeysModule.normalizeDashboardApiKeysPage(-1), 1);
assert.equal(apiKeysModule.normalizeDashboardApiKeysPage(2.8), 2);
assert.deepEqual(apiKeysModule.buildOrganizationApiKeysWhere("org_a"), {
  organizationId: "org_a",
});

const prismaA = createMockPrisma();
const dataA = await apiKeysModule.getDashboardApiKeysData(
  orgAContext,
  { page: 1 },
  prismaA
);

assert.equal(dataA.pagination.pageSize, 20);
assert.equal(dataA.rows.length, 20);
assert.equal(dataA.pagination.totalRows, 23);
assert.equal(dataA.pagination.hasNextPage, true);
assert.ok(dataA.rows.every((row) => row.keyPrefix.startsWith("hvcs_live_a_")));
assert.deepEqual(dataA.clients, [
  {
    id: "client_a_1",
    name: "Client A",
    organizationId: "org_a",
    organizationName: "Org A",
  },
  {
    id: "client_b_1",
    name: "Client B",
    organizationId: "org_b",
    organizationName: "Org B",
  },
]);
assert.deepEqual(dataA.organizations, organizations);

const findManyCall = prismaA.calls.find(([name]) => name === "apiKey.findMany")[1];
assert.equal(findManyCall.take, 20);
assert.equal(findManyCall.skip, 0);
assert.equal(JSON.stringify(findManyCall.where).includes("org_a"), true);

const selectString = JSON.stringify(findManyCall.select);
assert.equal(selectString.includes("apiKeyHash"), false);

const serializedA = JSON.stringify(dataA);
assert.equal(serializedA.includes("apiKeyHash"), false);
assert.equal(serializedA.includes("must-not-return"), false);
assert.equal(serializedA.includes("rawKey"), false);
assert.equal(serializedA.includes("encryptedAccountNumber"), false);
assert.equal(serializedA.includes("tokenHash"), false);

const dataB = await apiKeysModule.getDashboardApiKeysData(
  orgBContext,
  { page: 1 },
  createMockPrisma()
);

assert.equal(dataB.rows.length, 1);
assert.equal(dataB.rows[0].keyPrefix, "hvcs_live_b_1");

await assert.rejects(
  () => apiKeysModule.getDashboardApiKeysData(sellerContext, {}, createMockPrisma()),
  /platform admin/
);

await assert.rejects(
  () =>
    apiKeysModule.getDashboardApiKeysData(
      clientOwnerContext,
      {},
      createMockPrisma()
    ),
  /platform admin/
);

const createPrisma = createMockPrisma();
const created = await apiKeysModule.createDashboardApiKey({
  context: orgAContext,
  name: " Production CRM ",
  organizationId: "org_b",
  clientId: "client_b_1",
  prisma: createPrisma,
});

assert.equal(created.name, "Production CRM");
assert.equal(created.rawKey.startsWith("hvcs_live_"), true);
assert.equal(created.keyPrefix, apiKeysModule.createApiKeyPrefix(created.rawKey));
assert.equal(createPrisma.createdRows.length, 1);
assert.equal(createPrisma.createdRows[0].organizationId, "org_b");
assert.equal(createPrisma.createdRows[0].clientId, "client_b_1");
assert.equal(createPrisma.createdRows[0].apiKeyHash.startsWith("bcrypt:"), true);
assert.equal(createPrisma.createdRows[0].apiKeyHash.includes(created.rawKey), false);

await assert.rejects(
  () =>
    apiKeysModule.createDashboardApiKey({
      context: orgAContext,
      name: "Missing organization",
      organizationId: "org_missing",
      clientId: "client_a_1",
      prisma: createMockPrisma(),
    }),
  /Selected organization/
);

await assert.rejects(
  () =>
    apiKeysModule.createDashboardApiKey({
      context: orgAContext,
      name: "No client",
      organizationId: "org_a",
      clientId: null,
      prisma: createMockPrisma(),
    }),
  /Select a client/
);

await assert.rejects(
  () =>
    apiKeysModule.createDashboardApiKey({
      context: orgAContext,
      name: "Bad client",
      organizationId: "org_a",
      clientId: "client_b_1",
      prisma: createMockPrisma(),
    }),
  /not available/
);

await assert.rejects(
  () =>
    apiKeysModule.createDashboardApiKey({
      context: sellerContext,
      name: "Seller key",
      organizationId: "org_a",
      clientId: "client_a_1",
      prisma: createPrisma,
    }),
  /platform admin/
);

const revokePrisma = createMockPrisma();
await apiKeysModule.revokeDashboardApiKey({
  context: orgAContext,
  apiKeyId: "key_a_02",
  prisma: revokePrisma,
});

assert.equal(revokePrisma.updates.length, 1);
assert.equal(revokePrisma.updates[0].where.id, "key_a_02");
assert.equal(revokePrisma.updates[0].data.status, "REVOKED");
assert.ok(revokePrisma.updates[0].data.revokedAt instanceof Date);

await assert.rejects(
  () =>
    apiKeysModule.revokeDashboardApiKey({
      context: orgAContext,
      apiKeyId: "key_b_01",
      prisma: createMockPrisma(),
    }),
  /not found/
);

await assert.rejects(
  () =>
    apiKeysModule.revokeDashboardApiKey({
      context: sellerContext,
      apiKeyId: "key_a_02",
      prisma: createMockPrisma(),
    }),
  /platform admin/
);

console.log("Dashboard API keys verification passed.");
