#!/usr/bin/env node
// Verifies dashboard webhook delivery metadata is tenant-scoped, paginated, and sensitive-safe.

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
});

const orgAContext = {
  user: { id: "user_a" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "OWNER" },
};

const orgBContext = {
  user: { id: "user_b" },
  organization: { id: "org_b", name: "Org B" },
  membership: { role: "PLATFORM_ADMIN" },
};

const clientOwnerContext = {
  user: { id: "user_client_owner" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "CLIENT_OWNER" },
};

const sellerContext = {
  user: { id: "user_seller" },
  organization: { id: "org_a", name: "Org A" },
  membership: { role: "SELLER" },
};

const baseDate = new Date("2026-05-26T12:00:00.000Z");

const notifications = [
  ...Array.from({ length: 23 }, (_, index) => ({
    id: `notification_a_${String(index + 1).padStart(2, "0")}`,
    deliveryId: `delivery_a_${String(index + 1).padStart(2, "0")}`,
    organizationId: "org_a",
    channel: "WEBHOOK",
    providerId: index % 2 === 0 ? "verification.completed" : "certificate.created",
    status: index % 3 === 0 ? "SENT" : "QUEUED",
    saleId: `sale_a_${String(index + 1).padStart(2, "0")}`,
    recipient: "https://crm-a.example.com/private/path?token=hidden",
    attempts: index % 5,
    maxAttempts: 5,
    nextAttemptAt: index % 3 === 0 ? null : new Date(baseDate.getTime() + index * 1000),
    lastAttemptAt: index % 2 === 0 ? new Date(baseDate.getTime() - index * 1000) : null,
    lastResponseStatus: index % 3 === 0 ? 204 : null,
    lastSafeError: index % 3 === 0 ? null : "Webhook endpoint returned HTTP 500",
    deliveredAt: index % 3 === 0 ? new Date(baseDate.getTime()) : null,
    terminalFailureAt: null,
    createdAt: new Date(baseDate.getTime() + index * 1000),
    webhookSecret: "must-not-return",
    payload: { customerEmail: "private@example.com" },
    sale: {
      id: `sale_a_${String(index + 1).padStart(2, "0")}`,
      clientReference: `A-${String(index + 1).padStart(3, "0")}`,
      customerEmail: `private-${index}@example.com`,
      customerPhone: "+447700900000",
      customerAddress: "Sensitive Address",
      client: { organizationId: "org_a", webhookSecret: "secret" },
      verificationSessions: [
        {
          id: `session_a_${String(index + 1).padStart(2, "0")}`,
          tokenHash: "must-not-return",
          certificate: { id: `certificate_a_${String(index + 1).padStart(2, "0")}` },
        },
      ],
    },
  })),
  {
    id: "notification_b_01",
    deliveryId: "delivery_b_01",
    organizationId: "org_b",
    channel: "WEBHOOK",
    providerId: "verification.declined",
    status: "FAILED",
    saleId: "sale_b_01",
    recipient: "https://crm-b.example.com/secret",
    attempts: 5,
    maxAttempts: 5,
    nextAttemptAt: null,
    lastAttemptAt: new Date("2026-05-26T13:00:00.000Z"),
    lastResponseStatus: 410,
    lastSafeError: "Webhook endpoint returned HTTP 410",
    deliveredAt: null,
    terminalFailureAt: new Date("2026-05-26T13:01:00.000Z"),
    createdAt: new Date("2026-05-26T13:00:00.000Z"),
    webhookSecret: "must-not-return",
    payload: { tokenHash: "must-not-return" },
    sale: {
      id: "sale_b_01",
      clientReference: "B-001",
      customerEmail: "private-b@example.com",
      customerPhone: "+447700900001",
      customerAddress: "Sensitive Address B",
      client: { organizationId: "org_b", webhookSecret: "secret" },
      verificationSessions: [
        {
          id: "session_b_01",
          tokenHash: "must-not-return",
          certificate: { id: null },
        },
      ],
    },
  },
];

function organizationIdFromWhere(where) {
  return where.sale?.client?.organizationId;
}

function matchesWhere(notification, where) {
  if (notification.channel !== where.channel) return false;
  if (notification.organizationId !== organizationIdFromWhere(where)) return false;
  if (where.status && notification.status !== where.status) return false;
  if (where.providerId && notification.providerId !== where.providerId) return false;

  if (where.OR?.length) {
    const search = where.OR[0].saleId.contains.toLowerCase();
    return (
      notification.saleId.toLowerCase().includes(search) ||
      notification.sale.clientReference.toLowerCase().includes(search)
    );
  }

  return true;
}

function createMockPrisma() {
  const calls = [];

  return {
    calls,
    notification: {
      async count(args) {
        calls.push(["notification.count", args]);
        return notifications.filter((notification) =>
          matchesWhere(notification, args.where)
        ).length;
      },
      async findMany(args) {
        calls.push(["notification.findMany", args]);
        return notifications
          .filter((notification) => matchesWhere(notification, args.where))
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(args.skip, args.skip + args.take)
          .map((notification) => ({
            id: notification.id,
            deliveryId: notification.deliveryId,
            providerId: notification.providerId,
            status: notification.status,
            saleId: notification.saleId,
            recipient: notification.recipient,
            attempts: notification.attempts,
            maxAttempts: notification.maxAttempts,
            nextAttemptAt: notification.nextAttemptAt,
            lastAttemptAt: notification.lastAttemptAt,
            lastResponseStatus: notification.lastResponseStatus,
            lastSafeError: notification.lastSafeError,
            deliveredAt: notification.deliveredAt,
            terminalFailureAt: notification.terminalFailureAt,
            createdAt: notification.createdAt,
            sale: {
              id: notification.sale.id,
              clientReference: notification.sale.clientReference,
              verificationSessions: notification.sale.verificationSessions.map((session) => ({
                id: session.id,
                certificate: session.certificate,
              })),
            },
          }));
      },
    },
  };
}

assert.equal(webhooksModule.normalizeDashboardWebhooksPage(undefined), 1);
assert.equal(webhooksModule.normalizeDashboardWebhooksPage(-2), 1);
assert.equal(webhooksModule.normalizeDashboardWebhooksPage(2.9), 2);
assert.equal(webhooksModule.normalizeDashboardWebhooksStatus("sent"), "SENT");
assert.equal(webhooksModule.normalizeDashboardWebhooksStatus("bad"), null);
assert.equal(
  webhooksModule.normalizeDashboardWebhooksEventType("verification.completed"),
  "verification.completed"
);
assert.equal(webhooksModule.normalizeDashboardWebhooksEventType("bad"), null);
assert.equal(
  webhooksModule.normalizeDashboardWebhooksSearch("x".repeat(100)).length,
  80
);
assert.equal(
  webhooksModule.getSafeWebhookDestinationHost(
    "https://crm-a.example.com/private/path?token=hidden"
  ),
  "crm-a.example.com"
);

await assert.rejects(
  () =>
    webhooksModule.getDashboardWebhooksData(
      sellerContext,
      {},
      createMockPrisma()
    ),
  /access denied/
);

await assert.rejects(
  () =>
    webhooksModule.getDashboardWebhooksData(
      clientOwnerContext,
      {},
      createMockPrisma()
    ),
  /access denied/
);

const prismaA = createMockPrisma();
const dataA = await webhooksModule.getDashboardWebhooksData(
  orgAContext,
  { page: 1 },
  prismaA
);

assert.equal(dataA.pagination.pageSize, 20);
assert.equal(dataA.rows.length, 20);
assert.equal(dataA.pagination.totalRows, 23);
assert.equal(dataA.pagination.hasNextPage, true);
assert.ok(dataA.rows.every((row) => row.clientReference.startsWith("A-")));
assert.ok(dataA.rows.every((row) => row.destinationHost === "crm-a.example.com"));

const findManyCall = prismaA.calls.find(([name]) => name === "notification.findMany")[1];
assert.equal(findManyCall.take, 20);
assert.equal(findManyCall.skip, 0);
assert.equal(JSON.stringify(findManyCall.where).includes("org_a"), true);
assert.equal(JSON.stringify(findManyCall.where).includes("customerEmail"), false);
assert.equal(JSON.stringify(findManyCall.where).includes("customerPhone"), false);

const selectString = JSON.stringify(findManyCall.select);
for (const sensitive of [
  "webhookSecret",
  "payload",
  "headers",
  "apiKeyHash",
  "tokenHash",
  "encryptedAccountNumber",
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "certificateJson",
  "ipAddress",
  "userAgent",
]) {
  assert.equal(selectString.includes(sensitive), false, `select contains ${sensitive}`);
}

const serializedA = JSON.stringify(dataA);
for (const sensitive of [
  "webhookSecret",
  "must-not-return",
  "private@example.com",
  "+447700",
  "Sensitive Address",
  "private/path",
  "token=hidden",
  "payload",
  "apiKeyHash",
  "tokenHash",
  "encryptedAccountNumber",
  "certificateJson",
]) {
  assert.equal(serializedA.includes(sensitive), false, `data contains ${sensitive}`);
}

const dataB = await webhooksModule.getDashboardWebhooksData(
  orgBContext,
  { page: 1 },
  createMockPrisma()
);
assert.equal(dataB.rows.length, 1);
assert.equal(dataB.rows[0].clientReference, "B-001");
assert.equal(dataB.rows[0].destinationHost, "crm-b.example.com");

const filtered = await webhooksModule.getDashboardWebhooksData(
  orgAContext,
  { status: "queued", eventType: "certificate.created", search: "A-002" },
  createMockPrisma()
);
assert.equal(filtered.filters.status, "QUEUED");
assert.equal(filtered.filters.eventType, "certificate.created");
assert.equal(filtered.filters.search, "A-002");
assert.ok(filtered.rows.every((row) => row.eventType === "certificate.created"));

const empty = await webhooksModule.getDashboardWebhooksData(
  {
    user: { id: "user_empty" },
    organization: { id: "org_empty" },
    membership: { role: "OWNER" },
  },
  {},
  createMockPrisma()
);
assert.equal(empty.rows.length, 0);
assert.equal(empty.pagination.totalRows, 0);

const pageSource = readFileSync("src/app/dashboard/webhooks/page.tsx", "utf8");
assert.equal(pageSource.includes("DashboardRoleGate section=\"webhooks\""), true);
assert.equal(pageSource.includes("Retry now"), true);
assert.equal(pageSource.includes("View delivery"), true);
assert.equal(pageSource.includes("Edit endpoint"), true);
assert.equal(pageSource.includes("webhookSecret"), false);
assert.equal(pageSource.includes("raw payload"), false);

console.log("Dashboard webhooks verification passed.");
