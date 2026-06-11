#!/usr/bin/env node
// Verifies outbound webhook delivery safety, signing, and status handling.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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

const webhooks = loadTsModule("src/lib/webhooks.ts", {
  "@/lib/db": { db: {} },
});
const cryptoModule = loadTsModule("src/lib/crypto.ts");
const webhookSecretsModule = loadTsModule("src/lib/webhook-secrets.ts", {
  "@/lib/crypto": cryptoModule,
});
const delivery = loadTsModule("src/lib/webhook-delivery.ts", {
  "@/lib/db": { db: {} },
  "@/lib/webhooks": webhooks,
  "@/lib/webhook-secrets": webhookSecretsModule,
});

process.env.ENCRYPTION_KEY =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function createNotification(overrides = {}) {
  return {
    id: "notification_a",
    saleId: "sale_a",
    recipient: "https://crm.example.com/webhook",
    providerId: "verification.completed",
    deliveryId: "delivery_a",
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: null,
    sale: {
      id: "sale_a",
      clientReference: "CRM-123",
      productName: "Verified Energy Plan",
      status: "CONSENT_CONFIRMED",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-01T10:05:00.000Z"),
      client: {
        id: "client_a",
        organizationId: "org_a",
        webhookSecret: "webhook-secret-used-only-in-test",
      },
      verificationSessions: [
        {
          id: "session_a",
          status: "COMPLETED",
          createdAt: new Date("2026-05-01T10:01:00.000Z"),
          expiresAt: new Date("2026-05-02T10:01:00.000Z"),
          completedAt: new Date("2026-05-01T10:04:00.000Z"),
          declinedAt: null,
          certificate: { id: "certificate_a" },
        },
      ],
    },
    ...overrides,
  };
}

const notification = createNotification();
const encryptedSecret = webhookSecretsModule.encryptWebhookSecret(
  notification.sale.client.webhookSecret
);
const encryptedNotification = createNotification();
encryptedNotification.sale.client.webhookSecret = encryptedSecret;
const payload = delivery.buildPayloadForNotification(notification);

assert.equal(payload.event, "verification.completed");
assert.equal(payload.client_id, "client_a");
assert.equal(payload.sale_id, "sale_a");
assert.equal(payload.verification_session_id, "session_a");
assert.equal(payload.certificate_id, "certificate_a");
assert.equal(payload.data.product_name, "Verified Energy Plan");
assert.equal(payload.data.stable_delivery_id, "delivery_a");

const serializedPayload = JSON.stringify(payload);
for (const sensitive of [
  "apiKeyHash",
  "tokenHash",
  "encryptedAccountNumber",
  "accountNumber",
  "sortCode",
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "certificateJson",
  "webhookSecret",
  "verification_url",
]) {
  assert.equal(
    serializedPayload.includes(sensitive),
    false,
    `payload contains ${sensitive}`
  );
}

let capturedRequest = null;
const successResult = await delivery.deliverWebhookNotification({
  notification: encryptedNotification,
  fetchImpl: async (url, init) => {
    capturedRequest = { url, init };
    return { ok: true, status: 204 };
  },
});

assert.equal(successResult.ok, true);
assert.equal(successResult.status, "SENT");
assert.equal(successResult.attempts, 1);
assert.equal(capturedRequest.url, "https://crm.example.com/webhook");
assert.equal(capturedRequest.init.headers["Content-Type"], "application/json");
assert.equal(capturedRequest.init.headers["User-Agent"], "Heimdell-Webhook/1.0");
assert.equal(capturedRequest.init.headers["X-Heimdell-Event-Type"], "verification.completed");
assert.equal(capturedRequest.init.headers["X-Heimdell-Delivery-Id"], "delivery_a");

const signature = capturedRequest.init.headers["X-Heimdell-Signature"];
const expectedSignature = `sha256=${createHmac(
  "sha256",
  notification.sale.client.webhookSecret
)
  .update(capturedRequest.init.body)
  .digest("hex")}`;
assert.equal(signature, expectedSignature);
assert.equal(capturedRequest.init.body.includes(notification.sale.client.webhookSecret), false);
assert.equal(capturedRequest.init.body.includes(encryptedSecret), false);

const failureResult = await delivery.deliverWebhookNotification({
  notification,
  fetchImpl: async () => ({ ok: false, status: 500 }),
});
assert.equal(failureResult.ok, false);
assert.equal(failureResult.status, "RETRY_SCHEDULED");
assert.equal(failureResult.httpStatus, 500);
assert.equal(failureResult.retryable, true);
assert.equal(failureResult.terminal, false);
assert.ok(failureResult.nextAttemptAt);

const terminalResult = await delivery.deliverWebhookNotification({
  notification: createNotification({ attempts: 4, maxAttempts: 5 }),
  fetchImpl: async () => ({ ok: false, status: 500 }),
});
assert.equal(terminalResult.ok, false);
assert.equal(terminalResult.status, "FAILED");
assert.equal(terminalResult.retryable, false);
assert.equal(terminalResult.terminal, true);
assert.equal(terminalResult.attempts, 5);

const insecureResult = await delivery.deliverWebhookNotification({
  notification: createNotification({ recipient: "http://crm.example.com/webhook" }),
  env: { NODE_ENV: "production" },
  fetchImpl: async () => {
    throw new Error("fetch should not run");
  },
});
assert.equal(insecureResult.ok, false);
assert.equal(insecureResult.reason, "Webhook URL must be HTTPS");
assert.equal(insecureResult.terminal, true);

const updates = [];
const dbClient = {
  notification: {
    async findMany() {
      return [notification];
    },
    async update(args) {
      updates.push(args);
      return { id: args.where.id };
    },
  },
};

const processResult = await delivery.processWebhookDeliveries({
  dbClient,
  fetchImpl: async () => ({ ok: true, status: 200 }),
});
assert.equal(processResult.scanned, 1);
assert.equal(processResult.sent, 1);
assert.equal(updates[0].data.status, "SENT");
assert.equal(updates[0].data.attempts, 1);
assert.equal(updates[0].data.deliveredAt instanceof Date, true);
assert.ok(updates[0].data.sentAt instanceof Date);

const retryUpdates = [];
const retryDbClient = {
  notification: {
    async findMany() {
      return [notification];
    },
    async update(args) {
      retryUpdates.push(args);
      return { id: args.where.id };
    },
  },
};
const retryProcessResult = await delivery.processWebhookDeliveries({
  dbClient: retryDbClient,
  fetchImpl: async () => ({ ok: false, status: 500 }),
});
assert.equal(retryProcessResult.retryScheduled, 1);
assert.equal(retryUpdates[0].data.status, "QUEUED");
assert.equal(retryUpdates[0].data.attempts, 1);
assert.equal(retryUpdates[0].data.nextAttemptAt instanceof Date, true);
assert.equal(retryUpdates[0].data.terminalFailureAt, null);

const terminalUpdates = [];
const terminalDbClient = {
  notification: {
    async findMany() {
      return [createNotification({ attempts: 5, maxAttempts: 5 })];
    },
    async update(args) {
      terminalUpdates.push(args);
      return { id: args.where.id };
    },
  },
};
const terminalProcessResult = await delivery.processWebhookDeliveries({
  dbClient: terminalDbClient,
});
assert.equal(terminalProcessResult.terminalFailed, 1);
assert.equal(terminalUpdates[0].data.status, "FAILED");
assert.equal(terminalUpdates[0].data.terminalFailureAt instanceof Date, true);

const earlyDbClient = {
  notification: {
    async findMany(args) {
      assert.equal(args.where.status.in.includes("QUEUED"), true);
      assert.equal(args.where.status.in.includes("FAILED"), true);
      assert.equal(args.where.terminalFailureAt, null);
      assert.equal(args.where.deliveredAt, null);
      assert.equal(Boolean(args.where.OR[1].nextAttemptAt.lte), true);
      return [];
    },
    async update() {
      throw new Error("early retry should not update");
    },
  },
};
const earlyResult = await delivery.processWebhookDeliveries({
  dbClient: earlyDbClient,
});
assert.equal(earlyResult.scanned, 0);

const dryRunResult = await delivery.processWebhookDeliveries({
  dbClient,
  dryRun: true,
  fetchImpl: async () => {
    throw new Error("dry run should not fetch");
  },
});
assert.equal(dryRunResult.dryRun, 1);
assert.equal(updates.length, 1);

const source = readFileSync("src/lib/webhook-delivery.ts", "utf8");
assert.equal(source.includes("console.log"), false);
assert.equal(source.includes("console.error"), false);

console.log("Webhook delivery verification passed.");
