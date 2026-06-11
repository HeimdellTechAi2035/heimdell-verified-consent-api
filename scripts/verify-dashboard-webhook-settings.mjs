#!/usr/bin/env node
// Verifies tenant-scoped webhook endpoint settings safety and mutation rules.

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

const rolePolicy = loadTsModule("src/lib/dashboard-role-policy.ts");
const webhooksModule = loadTsModule("src/lib/dashboard-webhooks.ts", {
  "@/lib/db": { db: {} },
  "@/lib/dashboard-auth": {},
  "@/lib/dashboard-role-policy": rolePolicy,
  "@/lib/dashboard-performance": {
    nowMs: () => 0,
    logDashboardTiming: () => {},
  },
});
const cryptoModule = loadTsModule("src/lib/crypto.ts");
const webhookSecretsModule = loadTsModule("src/lib/webhook-secrets.ts", {
  "@/lib/crypto": cryptoModule,
});
const settings = loadTsModule("src/lib/dashboard-webhook-settings.ts", {
  "@/lib/db": { db: {} },
  "@/lib/dashboard-auth": {},
  "@/lib/dashboard-role-policy": rolePolicy,
  "@/lib/dashboard-webhooks": webhooksModule,
  "@/lib/webhook-secrets": webhookSecretsModule,
  "@/lib/dashboard-performance": {
    nowMs: () => 0,
    logDashboardTiming: () => {},
  },
});
const webhooks = loadTsModule("src/lib/webhooks.ts", {
  "@/lib/db": { db: {} },
});

process.env.ENCRYPTION_KEY =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const ownerContext = {
  user: { id: "user_owner" },
  organization: { id: "org_a" },
  membership: { role: "OWNER" },
};
const managerContext = {
  user: { id: "user_manager" },
  organization: { id: "org_a" },
  membership: { role: "CLIENT_MANAGER" },
};
const clientOwnerContext = {
  user: { id: "user_client_owner" },
  organization: { id: "org_a" },
  membership: { role: "CLIENT_OWNER" },
};
const sellerContext = {
  user: { id: "user_seller" },
  organization: { id: "org_a" },
  membership: { role: "SELLER" },
};
const orgBContext = {
  user: { id: "user_b" },
  organization: { id: "org_b" },
  membership: { role: "OWNER" },
};

const clients = [
  {
    id: "client_a",
    organizationId: "org_a",
    name: "Client A",
    webhookUrl: "https://crm-a.example.com/private/webhook?secret=nope",
    webhookSecret: "existing-secret",
    createdAt: new Date("2026-05-26T10:00:00.000Z"),
    updatedAt: new Date("2026-05-26T11:00:00.000Z"),
    sales: [
      {
        notifications: [
          {
            status: "SENT",
            deliveredAt: new Date("2026-05-26T12:00:00.000Z"),
            terminalFailureAt: null,
            lastAttemptAt: new Date("2026-05-26T12:00:00.000Z"),
          },
          {
            status: "FAILED",
            deliveredAt: null,
            terminalFailureAt: new Date("2026-05-26T13:00:00.000Z"),
            lastAttemptAt: new Date("2026-05-26T12:59:00.000Z"),
          },
        ],
      },
    ],
  },
  {
    id: "client_b",
    organizationId: "org_b",
    name: "Client B",
    webhookUrl: "https://crm-b.example.com/webhook",
    webhookSecret: "secret-b",
    createdAt: new Date("2026-05-26T10:00:00.000Z"),
    updatedAt: new Date("2026-05-26T11:00:00.000Z"),
    sales: [],
  },
];

function createMockPrisma() {
  const updates = [];

  return {
    updates,
    client: {
      async findMany(args) {
        return clients
          .filter((client) => client.organizationId === args.where.organizationId)
          .map((client) => ({
            id: client.id,
            name: client.name,
            webhookUrl: client.webhookUrl,
            webhookSecret: client.webhookSecret,
            createdAt: client.createdAt,
            updatedAt: client.updatedAt,
            sales: client.sales,
          }));
      },
      async findFirst(args) {
        const client = clients.find(
          (item) =>
            item.id === args.where.id &&
            item.organizationId === args.where.organizationId
        );
        if (!client) return null;
        return {
          id: client.id,
          webhookSecret: client.webhookSecret,
        };
      },
      async update(args) {
        updates.push(args);
        return { id: args.where.id };
      },
    },
  };
}

assert.equal(settings.canManageWebhookSettings("OWNER"), true);
assert.equal(settings.canManageWebhookSettings("PLATFORM_ADMIN"), true);
assert.equal(settings.canManageWebhookSettings("ADMIN"), false);
assert.equal(settings.canManageWebhookSettings("CLIENT_OWNER"), false);
assert.equal(settings.canManageWebhookSettings("MANAGER"), false);
assert.equal(settings.canManageWebhookSettings("SELLER"), false);
assert.equal(settings.canManageWebhookSettings("COMPLIANCE_VIEWER"), false);

assert.equal(
  settings.validateWebhookEndpointUrl("https://example.com/hook").ok,
  true
);
assert.equal(
  settings.validateWebhookEndpointUrl("http://localhost:3000/hook", {
    NODE_ENV: "development",
  }).ok,
  true
);
assert.equal(
  settings.validateWebhookEndpointUrl("http://example.com/hook", {
    NODE_ENV: "production",
  }).ok,
  false
);

const prisma = createMockPrisma();
const data = await settings.getDashboardWebhookSettingsData(ownerContext, prisma);
assert.equal(data.canManage, true);
assert.equal(data.rows.length, 1);
assert.equal(data.rows[0].clientId, "client_a");
assert.equal(data.rows[0].destinationHost, "crm-a.example.com");
assert.equal(data.rows[0].signingSecretConfigured, true);
assert.equal(data.rows[0].signingSecretStorage, "legacy_plaintext");
assert.equal(data.rows[0].signingSecretDisplay.startsWith("whsec_..."), true);
assert.equal(data.rows[0].enabled, true);
assert.ok(data.rows[0].lastSuccessfulDeliveryAt);
assert.ok(data.rows[0].lastFailureAt);

const serialized = JSON.stringify(data);
for (const sensitive of [
  "existing-secret",
  "private/webhook",
  "secret=nope",
  "webhookSecret",
  "payload",
  "apiKeyHash",
  "tokenHash",
  "encryptedAccountNumber",
  "customerEmail",
]) {
  assert.equal(serialized.includes(sensitive), false, `data contains ${sensitive}`);
}

await assert.rejects(
  () =>
    settings.getDashboardWebhookSettingsData(managerContext, createMockPrisma()),
  /access denied/
);

await assert.rejects(
  () =>
    settings.getDashboardWebhookSettingsData(
      clientOwnerContext,
      createMockPrisma()
    ),
  /access denied/
);

await assert.rejects(
  () => settings.getDashboardWebhookSettingsData(sellerContext, createMockPrisma()),
  /access denied/
);

await assert.rejects(
  () =>
    settings.upsertClientWebhookEndpoint({
      context: managerContext,
      clientId: "client_a",
      webhookUrl: "https://crm-a.example.com/new",
      prisma: createMockPrisma(),
    }),
  /platform admin/
);

await assert.rejects(
  () =>
    settings.upsertClientWebhookEndpoint({
      context: clientOwnerContext,
      clientId: "client_a",
      webhookUrl: "https://crm-a.example.com/new",
      prisma: createMockPrisma(),
    }),
  /platform admin/
);

const mutationPrisma = createMockPrisma();
const createResult = await settings.upsertClientWebhookEndpoint({
  context: ownerContext,
  clientId: "client_a",
  webhookUrl: "https://crm-a.example.com/new",
  rotateSecret: true,
  prisma: mutationPrisma,
});
assert.equal(createResult.ok, true);
assert.ok(createResult.oneTimeSecret.startsWith("whsec_"));
assert.equal(mutationPrisma.updates[0].where.id, "client_a");
assert.equal(mutationPrisma.updates[0].data.webhookUrl, "https://crm-a.example.com/new");
assert.notEqual(
  mutationPrisma.updates[0].data.webhookSecret,
  createResult.oneTimeSecret,
  "stored webhook secret must not be plaintext"
);
assert.equal(mutationPrisma.updates[0].data.webhookSecret.startsWith("v1:"), true);
assert.equal(
  webhookSecretsModule.decryptWebhookSecret(
    mutationPrisma.updates[0].data.webhookSecret
  ),
  createResult.oneTimeSecret
);

const noRotatePrisma = createMockPrisma();
const updateResult = await settings.upsertClientWebhookEndpoint({
  context: ownerContext,
  clientId: "client_a",
  webhookUrl: "https://crm-a.example.com/updated",
  rotateSecret: false,
  prisma: noRotatePrisma,
});
assert.equal(updateResult.ok, true);
assert.equal("oneTimeSecret" in updateResult, false);
assert.equal("webhookSecret" in noRotatePrisma.updates[0].data, false);

const crossTenantResult = await settings.upsertClientWebhookEndpoint({
  context: orgBContext,
  clientId: "client_a",
  webhookUrl: "https://crm-b.example.com/new",
  prisma: createMockPrisma(),
});
assert.equal(crossTenantResult.ok, false);

const disablePrisma = createMockPrisma();
const disableResult = await settings.disableClientWebhookEndpoint({
  context: ownerContext,
  clientId: "client_a",
  prisma: disablePrisma,
});
assert.equal(disableResult.ok, true);
assert.equal(disablePrisma.updates[0].data.webhookUrl, null);
assert.equal("webhookSecret" in disablePrisma.updates[0].data, false);

const payload = webhooks.buildWebhookPayload({
  event: "webhook.test",
  clientId: "client_a",
  saleId: "sale_a",
  clientReference: "CRM-1",
  verificationSessionId: "session_a",
  status: "TEST",
  data: { message: "safe" },
});
const signature = webhooks.createWebhookSignatureHeader(payload, createResult.oneTimeSecret);
assert.equal(signature.startsWith("sha256="), true);

const managerSource = readFileSync(
  "src/components/dashboard/WebhookEndpointManager.tsx",
  "utf8"
);
assert.equal(managerSource.includes("x-api-key"), false);
assert.equal(managerSource.includes("webhookSecret"), false);
assert.equal(managerSource.includes("oneTimeSecret"), true);

console.log("Dashboard webhook settings verification passed.");
