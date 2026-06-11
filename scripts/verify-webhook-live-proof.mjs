#!/usr/bin/env node
// Proves live webhook delivery against a local HTTP receiver without DB secrets.

import assert from "node:assert/strict";
import http from "node:http";
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

function startReceiver() {
  const received = [];
  const server = http.createServer((req, res) => {
    let rawBody = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      rawBody += chunk;
    });
    req.on("end", () => {
      received.push({
        headers: req.headers,
        rawBody,
        payload: JSON.parse(rawBody),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        received,
        url: `http://127.0.0.1:${address.port}/webhook`,
      });
    });
  });
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

const completionSource = readFileSync(
  "src/app/api/v1/verification-sessions/[token]/complete/route.ts",
  "utf8"
);
assert.match(completionSource, /sendVerificationCompletedNotification/);
assert.match(completionSource, /sendCertificateCreatedNotification/);
assert.match(completionSource, /clientWebhookUrl: sale\.client\.webhookUrl/);
assert.match(completionSource, /webhookSecret: sale\.client\.webhookSecret/);

process.env.ENCRYPTION_KEY =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const webhookSecret = "local-live-proof-secret";
const receiver = await startReceiver();

const notification = {
  id: "notification_live_proof",
  saleId: "sale_live_proof",
  recipient: receiver.url,
  providerId: "verification.completed",
  deliveryId: "delivery_live_proof",
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: null,
  sale: {
    id: "sale_live_proof",
    clientReference: "SELLER-PROOF-LIVE",
    productName: "Proof Broadband",
    status: "VERIFIED",
    createdAt: new Date("2026-06-03T10:00:00.000Z"),
    updatedAt: new Date("2026-06-03T10:05:00.000Z"),
    client: {
      id: "client_live_proof",
      organizationId: "org_live_proof",
      webhookSecret,
    },
    verificationSessions: [
      {
        id: "session_live_proof",
        status: "COMPLETED",
        createdAt: new Date("2026-06-03T10:01:00.000Z"),
        expiresAt: new Date("2026-06-03T10:31:00.000Z"),
        completedAt: new Date("2026-06-03T10:04:00.000Z"),
        declinedAt: null,
        certificate: { id: "certificate_live_proof" },
      },
    ],
  },
};

try {
  const result = await delivery.deliverWebhookNotification({
    notification,
    env: { NODE_ENV: "development" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "SENT");
  assert.equal(result.httpStatus, 200);
  assert.equal(receiver.received.length, 1);

  const request = receiver.received[0];
  const payload = request.payload;

  assert.equal(request.headers["x-heimdell-event-type"], "verification.completed");
  assert.equal(request.headers["x-heimdell-delivery-id"], "delivery_live_proof");
  assert.equal(request.headers["user-agent"], "Heimdell-Webhook/1.0");
  assert.equal(payload.event, "verification.completed");
  assert.equal(payload.sale_id, "sale_live_proof");
  assert.equal(payload.client_reference, "SELLER-PROOF-LIVE");
  assert.equal(payload.verification_session_id, "session_live_proof");
  assert.equal(payload.certificate_id, "certificate_live_proof");
  assert.equal(payload.status, "COMPLETED");
  assert.equal(payload.data.sale_status, "VERIFIED");
  assert.equal(payload.data.verification_status, "COMPLETED");

  const signature = request.headers["x-heimdell-signature"];
  const expectedSignature = `sha256=${createHmac("sha256", webhookSecret)
    .update(request.rawBody)
    .digest("hex")}`;
  assert.equal(signature, expectedSignature);
  assert.equal(request.headers["x-hvcs-signature"], expectedSignature);

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
    "webhookSecret",
    "certificateJson",
    "verification_url",
    webhookSecret,
  ]) {
    assert.equal(
      serializedPayload.includes(sensitive),
      false,
      `webhook payload exposed ${sensitive}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        delivery: result.status,
        received_event: payload.event,
        signature_verified: true,
        safe_fields_checked: true,
      },
      null,
      2
    )
  );
} finally {
  await new Promise((resolve) => receiver.server.close(resolve));
}
