#!/usr/bin/env node
// Live demo-loop E2E test. Creates unique fake records only; never wipes data.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const BASE_URL = (process.env.E2E_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REQUIRED_ENV = ["DATABASE_URL", "ENCRYPTION_KEY", "EMBED_TOKEN_SECRET"];
const FORBIDDEN_RESPONSE_VALUES = [
  "12345678",
  "123456",
  "12-34-56",
  "apiKeyHash",
  "tokenHash",
  "encryptedAccountNumber",
  "rawApiKey",
  "webhookSecret",
  "jane.e2e@example.com",
  "447700900000",
  "1 Example Street",
  "full certificateJson",
  "raw verification token",
];

const prisma = new PrismaClient({ log: [] });

function fail(message) {
  throw new Error(`[demo-e2e] ${message}`);
}

function assertEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    fail(
      `Missing required env vars: ${missing.join(", ")}. Copy .env.example to .env.local and configure local demo values first.`
    );
  }
}

async function assertServerReady() {
  let response;
  try {
    response = await fetch(`${BASE_URL}/api/health`);
  } catch {
    fail(
      `Could not reach ${BASE_URL}. Start the app first with "npm run dev" or "npm run start", or set E2E_BASE_URL.`
    );
  }

  if (!response.ok) {
    fail(`Health check failed at ${BASE_URL}/api/health with HTTP ${response.status}.`);
  }
}

function uniqueId() {
  return `${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function assertNoSensitiveSurface(value, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const forbidden of FORBIDDEN_RESPONSE_VALUES) {
    assert.equal(
      text.includes(forbidden),
      false,
      `${label} contains forbidden sensitive marker: ${forbidden}`
    );
  }
}

async function postJson(path, body, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { response, json, text };
}

async function getText(path, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { headers });
  const text = await response.text();
  return { response, text };
}

async function eventually(fn, label, timeoutMs = 5000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (lastError) throw lastError;
  fail(`${label} did not become true within ${timeoutMs}ms.`);
}

async function createTenantFixture() {
  const suffix = uniqueId();
  const rawApiKey = `hvcs_e2e_${randomBytes(24).toString("base64url")}`;
  const webhookSecret = `whsec_e2e_${randomBytes(24).toString("base64url")}`;
  const organization = await prisma.organization.create({
    data: {
      name: `E2E Organization ${suffix}`,
      slug: `e2e-${suffix}`,
    },
  });
  const otherOrganization = await prisma.organization.create({
    data: {
      name: `E2E Other Organization ${suffix}`,
      slug: `e2e-other-${suffix}`,
    },
  });
  const seller = await prisma.user.create({
    data: {
      email: `seller-${suffix}@example.com`,
      externalAuthId: `e2e-seller-${suffix}`,
      name: "E2E Seller",
    },
  });
  await prisma.organizationMembership.create({
    data: {
      organizationId: organization.id,
      userId: seller.id,
      role: "SELLER",
    },
  });

  const apiKeyHash = await bcrypt.hash(rawApiKey, 12);
  const client = await prisma.client.create({
    data: {
      organizationId: organization.id,
      name: `E2E Client ${suffix}`,
      apiKeyHash,
      webhookUrl: "http://localhost:4010/webhook",
      webhookSecret,
      status: "ACTIVE",
    },
  });

  await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      clientId: client.id,
      name: "E2E API Key",
      keyPrefix: rawApiKey.slice(0, 18),
      apiKeyHash,
      status: "ACTIVE",
      createdByUserId: seller.id,
    },
  });

  return {
    suffix,
    rawApiKey,
    organization,
    otherOrganization,
    client,
  };
}

function buildSalePayload(clientReference) {
  const payload = JSON.parse(
    readFileSync("test-payloads/sale-intake.valid.json", "utf8")
  );
  payload.client_reference = clientReference;
  payload.customer.full_name = "Jane Smith";
  payload.customer.email = "jane.e2e@example.com";
  payload.customer.phone = "447700900000";
  payload.customer.address = "1 Example Street, Preston, PR1 1AA";
  payload.direct_debit.account_number = "12345678";
  payload.direct_debit.sort_code = "12-34-56";
  return payload;
}

function readCompletePayload() {
  return JSON.parse(
    readFileSync("test-payloads/complete-verification.valid.json", "utf8")
  );
}

async function main() {
  assertEnv();
  await assertServerReady();

  const fixture = await createTenantFixture();
  const clientReference = `E2E-${fixture.suffix}`;

  const intake = await postJson(
    "/api/v1/sales/intake",
    buildSalePayload(clientReference),
    { "x-api-key": fixture.rawApiKey }
  );
  assert.equal(intake.response.status, 201, `sale intake failed: ${intake.text}`);
  assert.equal(intake.json.ok, true);
  assert.match(intake.json.verification_url, /\/v\//);
  assertNoSensitiveSurface(intake.json, "sale intake response");

  const token = String(intake.json.verification_url).split("/v/")[1];
  const sessionId = intake.json.verification_session_id;
  const saleId = intake.json.sale_id;
  assert.ok(token, "sale intake did not return a verification URL token");
  assert.ok(sessionId, "sale intake did not return a verification session ID");

  const page = await getText(`/v/${encodeURIComponent(token)}`);
  assert.equal(page.response.status, 200, "customer verification page did not load");
  assert.equal(page.text.includes("Premium Broadband"), true);
  assertNoSensitiveSurface(page.text, "customer verification page");

  const completion = await postJson(
    `/api/v1/verification-sessions/${encodeURIComponent(token)}/complete`,
    readCompletePayload(),
    { "user-agent": "Heimdell-E2E/1.0" }
  );
  assert.equal(completion.response.status, 200, `completion failed: ${completion.text}`);
  assert.equal(completion.json.ok, true);
  assert.equal(completion.json.status, "COMPLETED");
  assert.ok(completion.json.certificate_id, "completion did not return a certificate ID");
  assertNoSensitiveSurface(completion.json, "completion response");

  const certificateId = completion.json.certificate_id;
  const certificate = await eventually(
    () =>
      prisma.certificate.findUnique({
        where: { id: certificateId },
        include: {
          verificationSession: {
            include: {
              sale: {
                include: { client: true },
              },
            },
          },
        },
      }),
    "certificate creation"
  );
  assert.equal(certificate.verificationSessionId, sessionId);
  assert.equal(certificate.verificationSession.sale.id, saleId);
  assert.equal(certificate.verificationSession.sale.status, "VERIFIED");

  const orgScopedCertificate = await prisma.certificate.findFirst({
    where: {
      id: certificateId,
      verificationSession: {
        sale: {
          client: {
            organizationId: fixture.organization.id,
          },
        },
      },
    },
    select: { id: true },
  });
  const crossTenantCertificate = await prisma.certificate.findFirst({
    where: {
      id: certificateId,
      verificationSession: {
        sale: {
          client: {
            organizationId: fixture.otherOrganization.id,
          },
        },
      },
    },
    select: { id: true },
  });
  assert.equal(orgScopedCertificate?.id, certificateId);
  assert.equal(crossTenantCertificate, null, "certificate was visible across tenants");

  const certificateApi = await getText(
    `/api/v1/certificates/${encodeURIComponent(certificateId)}`,
    { "x-api-key": fixture.rawApiKey }
  );
  assert.equal(certificateApi.response.status, 200);
  const certificateJson = JSON.parse(certificateApi.text);
  assert.equal(certificateJson.ok, true);
  assert.equal(certificateJson.certificate_id, certificateId);
  assertNoSensitiveSurface(certificateJson, "certificate API response");

  const notifications = await eventually(
    async () => {
      const records = await prisma.notification.findMany({
        where: {
          saleId,
          channel: "WEBHOOK",
          status: "QUEUED",
        },
        select: {
          id: true,
          providerId: true,
          recipient: true,
          status: true,
          deliveryId: true,
        },
      });
      return records.length >= 2 ? records : null;
    },
    "queued webhook notifications"
  );
  assert.equal(
    notifications.some((record) => record.providerId === "verification.completed"),
    true
  );
  assert.equal(
    notifications.some((record) => record.providerId === "certificate.created"),
    true
  );
  assertNoSensitiveSurface(notifications, "webhook notification metadata");

  const embed = await postJson(
    "/api/v1/embed-tokens",
    { type: "verification_status", target: sessionId },
    { "x-api-key": fixture.rawApiKey }
  );
  assert.equal(embed.response.status, 200, `embed token creation failed: ${embed.text}`);
  assert.equal(embed.json.ok, true);
  assert.ok(embed.json.token);
  assertNoSensitiveSurface(embed.json, "embed token response");

  const embedStatus = await getText(
    `/api/v1/embed/verification/${encodeURIComponent(sessionId)}/status`,
    {
      Authorization: `Bearer ${embed.json.token}`,
      Origin: BASE_URL,
    }
  );
  assert.equal(embedStatus.response.status, 200, `embed status failed: ${embedStatus.text}`);
  const embedStatusJson = JSON.parse(embedStatus.text);
  assert.equal(embedStatusJson.ok, true);
  assert.equal(embedStatusJson.verification_status, "COMPLETED");
  assert.equal(embedStatusJson.certificate_id, certificateId);
  assertNoSensitiveSurface(embedStatusJson, "embed status response");

  const widgetSource = readFileSync("public/widget.js", "utf8");
  assert.equal(widgetSource.includes("x-api-key"), false);
  assert.equal(widgetSource.includes("apiKey"), false);

  const rolePolicySource = readFileSync("src/lib/dashboard-role-policy.ts", "utf8");
  assert.equal(
    /certificates:\s*\[[^\]]*SELLER/s.test(rolePolicySource),
    false,
    "SELLER appears to be allowed in certificate dashboard policy"
  );

  const pdfRouteSource = readFileSync(
    "src/app/dashboard/certificates/[id]/pdf/route.ts",
    "utf8"
  );
  assert.equal(pdfRouteSource.includes('"SELLER"'), false);
  assert.equal(pdfRouteSource.includes("requireDashboardRole"), true);
  assert.equal(pdfRouteSource.includes("application/pdf"), true);

  console.log("Demo E2E loop passed.");
  console.log(`- Base URL: ${BASE_URL}`);
  console.log(`- Sale ID: ${saleId}`);
  console.log(`- Verification session ID: ${sessionId}`);
  console.log(`- Certificate ID: ${certificateId}`);
  console.log(`- Webhook notifications queued: ${notifications.length}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
