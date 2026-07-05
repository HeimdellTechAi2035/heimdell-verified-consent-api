#!/usr/bin/env node
// Verifies v1 x-api-key auth: fast lookupHash path first, then a bounded
// scan for legacy rows (ApiKey and Client) that predate the lookupHash
// column and only ever stored a bcrypt hash.

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

const authModule = loadTsModule("src/lib/auth.ts", {
  "@/lib/db": { db: {} },
  "@/lib/crypto": {
    async compareHash(value, hash) {
      return value === hash;
    },
    // Identity stand-in for the real SHA-256 hash -- fixtures below set
    // lookupHash equal to the raw key literal to match.
    hashToken(value) {
      return value;
    },
  },
});

const now = Date.now();

function createMockPrisma() {
  const calls = [];
  const updates = [];
  const apiKeys = [
    {
      id: "api_key_active_client",
      organizationId: "org_a",
      clientId: "client_a",
      name: "Client key",
      apiKeyHash: "raw-new-client-key",
      lookupHash: "raw-new-client-key",
      status: "ACTIVE",
      expiresAt: new Date(now + 60_000),
      client: {
        id: "client_a",
        organizationId: "org_a",
        webhookUrl: "https://example.com/webhook",
        webhookSecret: "secret",
        organization: { archivedAt: null },
      },
      organization: { archivedAt: null },
    },
    {
      id: "api_key_org",
      organizationId: "org_a",
      clientId: null,
      name: "Org key",
      apiKeyHash: "raw-org-key",
      lookupHash: "raw-org-key",
      status: "ACTIVE",
      expiresAt: null,
      client: null,
      organization: { archivedAt: null },
    },
    {
      id: "api_key_cross_org_client",
      organizationId: "org_a",
      clientId: "client_b",
      name: "Bad key",
      apiKeyHash: "raw-cross-org-key",
      lookupHash: "raw-cross-org-key",
      status: "ACTIVE",
      expiresAt: null,
      client: {
        id: "client_b",
        organizationId: "org_b",
        webhookUrl: null,
        webhookSecret: null,
        organization: { archivedAt: null },
      },
      organization: { archivedAt: null },
    },
    {
      id: "api_key_revoked",
      organizationId: "org_a",
      clientId: "client_a",
      name: "Revoked key",
      apiKeyHash: "raw-revoked-key",
      lookupHash: "raw-revoked-key",
      status: "REVOKED",
      expiresAt: null,
      client: {
        id: "client_a",
        organizationId: "org_a",
        webhookUrl: null,
        webhookSecret: null,
        organization: { archivedAt: null },
      },
      organization: { archivedAt: null },
    },
    {
      id: "api_key_expired",
      organizationId: "org_a",
      clientId: "client_a",
      name: "Expired key",
      apiKeyHash: "raw-expired-key",
      lookupHash: "raw-expired-key",
      status: "ACTIVE",
      expiresAt: new Date(now - 60_000),
      client: {
        id: "client_a",
        organizationId: "org_a",
        webhookUrl: null,
        webhookSecret: null,
        organization: { archivedAt: null },
      },
      organization: { archivedAt: null },
    },
    {
      // Simulates a key created before the lookupHash migration -- must
      // still authenticate via the bounded legacy scan.
      id: "api_key_pre_migration",
      organizationId: "org_a",
      clientId: null,
      name: "Pre-migration key",
      apiKeyHash: "raw-pre-migration-key",
      lookupHash: null,
      status: "ACTIVE",
      expiresAt: null,
      client: null,
      organization: { archivedAt: null },
    },
  ];
  const clients = [
    {
      // Simulates a legacy Client row from before the lookupHash migration.
      id: "legacy_client",
      organizationId: "org_legacy",
      apiKeyHash: "raw-legacy-key",
      lookupHash: null,
      status: "ACTIVE",
      webhookUrl: null,
      webhookSecret: null,
      organization: { archivedAt: null },
    },
    {
      // A newer legacy-style Client row that DOES have a lookupHash (e.g. a
      // freshly-provisioned placeholder row).
      id: "fast_legacy_client",
      organizationId: "org_fast_legacy",
      apiKeyHash: "raw-fast-legacy-key",
      lookupHash: "raw-fast-legacy-key",
      status: "ACTIVE",
      webhookUrl: null,
      webhookSecret: null,
      organization: { archivedAt: null },
    },
  ];

  return {
    calls,
    updates,
    apiKey: {
      async findUnique(args) {
        calls.push(["apiKey.findUnique", args]);
        return apiKeys.find((key) => key.lookupHash === args.where.lookupHash) ?? null;
      },
      async findMany(args) {
        calls.push(["apiKey.findMany", args]);
        assert.equal(args.where.lookupHash, null);
        assert.equal(JSON.stringify(args.where).includes("ACTIVE"), true);
        assert.equal(JSON.stringify(args.where).includes("expiresAt"), true);
        return apiKeys.filter((key) => key.lookupHash === null);
      },
      async update(args) {
        calls.push(["apiKey.update", args]);
        updates.push(args);
        return { id: args.where.id };
      },
    },
    client: {
      async findUnique(args) {
        calls.push(["client.findUnique", args]);
        return clients.find((client) => client.lookupHash === args.where.lookupHash) ?? null;
      },
      async findMany(args) {
        calls.push(["client.findMany", args]);
        assert.equal(args.where.lookupHash, null);
        assert.equal(args.where.status, "ACTIVE");
        assert.ok(Array.isArray(args.where.OR));
        return clients.filter((client) => client.lookupHash === null);
      },
    },
  };
}

const prismaNew = createMockPrisma();
const newAuth = await authModule.authenticateApiKey(
  "raw-new-client-key",
  prismaNew
);

assert.equal(newAuth.mode, "api_key");
assert.equal(newAuth.organizationId, "org_a");
assert.equal(newAuth.clientId, "client_a");
assert.equal(newAuth.apiKeyId, "api_key_active_client");
assert.equal(newAuth.keyName, "Client key");
assert.equal(newAuth.client.id, "client_a");
assert.equal(prismaNew.updates.length, 1);
assert.equal(prismaNew.updates[0].where.id, "api_key_active_client");
assert.ok(prismaNew.updates[0].data.lastUsedAt instanceof Date);
// The fast path found a match, so the legacy scan must never have run.
assert.equal(
  prismaNew.calls.some(([name]) => name === "apiKey.findMany"),
  false
);

const serializedNew = JSON.stringify(newAuth);
assert.equal(serializedNew.includes("apiKeyHash"), false);
assert.equal(serializedNew.includes("raw-new-client-key"), false);

const prismaOrg = createMockPrisma();
const orgAuth = await authModule.authenticateApiKey("raw-org-key", prismaOrg);
assert.equal(orgAuth.mode, "api_key");
assert.equal(orgAuth.organizationId, "org_a");
assert.equal(orgAuth.clientId, null);
assert.equal(orgAuth.client, null);

const prismaLegacy = createMockPrisma();
const legacyAuth = await authModule.authenticateApiKey(
  "raw-legacy-key",
  prismaLegacy
);
assert.equal(legacyAuth.mode, "legacy_client_key");
assert.equal(legacyAuth.organizationId, "org_legacy");
assert.equal(legacyAuth.clientId, "legacy_client");
assert.equal(legacyAuth.apiKeyId, null);
assert.equal(legacyAuth.client.id, "legacy_client");
// A pre-migration key has no lookupHash, so both fast paths must have been
// tried and missed before falling back to the legacy scans.
assert.equal(
  prismaLegacy.calls.some(([name]) => name === "apiKey.findMany"),
  true
);
assert.equal(
  prismaLegacy.calls.some(([name]) => name === "client.findMany"),
  true
);

const prismaPreMigration = createMockPrisma();
const preMigrationAuth = await authModule.authenticateApiKey(
  "raw-pre-migration-key",
  prismaPreMigration
);
assert.equal(preMigrationAuth.mode, "api_key");
assert.equal(preMigrationAuth.organizationId, "org_a");
assert.equal(preMigrationAuth.apiKeyId, "api_key_pre_migration");

const prismaFastLegacy = createMockPrisma();
const fastLegacyAuth = await authModule.authenticateApiKey(
  "raw-fast-legacy-key",
  prismaFastLegacy
);
assert.equal(fastLegacyAuth.mode, "legacy_client_key");
assert.equal(fastLegacyAuth.organizationId, "org_fast_legacy");
assert.equal(fastLegacyAuth.clientId, "fast_legacy_client");
// Found via the fast client.findUnique lookup -- the legacy client scan
// must never have run.
assert.equal(
  prismaFastLegacy.calls.some(([name]) => name === "client.findMany"),
  false
);

const legacyClient = await authModule.findClientByApiKey(
  "raw-legacy-key",
  createMockPrisma()
);
assert.equal(legacyClient.id, "legacy_client");

const newClient = await authModule.findClientByApiKey(
  "raw-new-client-key",
  createMockPrisma()
);
assert.equal(newClient.id, "client_a");

const orgClient = await authModule.findClientByApiKey(
  "raw-org-key",
  createMockPrisma()
);
assert.equal(orgClient, null);

const crossOrg = await authModule.authenticateApiKey(
  "raw-cross-org-key",
  createMockPrisma()
);
assert.equal(crossOrg, null);

const revoked = await authModule.authenticateApiKey(
  "raw-revoked-key",
  createMockPrisma()
);
assert.equal(revoked, null);

const expired = await authModule.authenticateApiKey(
  "raw-expired-key",
  createMockPrisma()
);
assert.equal(expired, null);

const invalid = await authModule.authenticateApiKey(
  "not-a-key",
  createMockPrisma()
);
assert.equal(invalid, null);

const serializedLegacy = JSON.stringify(legacyAuth);
assert.equal(serializedLegacy.includes("apiKeyHash"), false);
assert.equal(serializedLegacy.includes("raw-legacy-key"), false);
assert.equal(serializedLegacy.includes("tokenHash"), false);
assert.equal(serializedLegacy.includes("encryptedAccountNumber"), false);

console.log("API auth compatibility verification passed.");
