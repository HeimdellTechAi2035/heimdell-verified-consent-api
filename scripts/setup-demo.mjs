#!/usr/bin/env node
// Idempotent local demo setup. Does not wipe data and does not print secrets.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createCipheriv, randomBytes } from "node:crypto";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ORG_NAME = "Heimdell Demo Organization";
const DEFAULT_ORG_SLUG = "heimdell-demo";
const DEFAULT_CLIENT_NAME = "Heimdell Demo Client";
const DEFAULT_API_KEY_NAME = "Local Demo API Key";

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;

    const [name, inlineValue] = current.slice(2).split("=", 2);
    parsed[name] = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }

  return parsed;
}

function required(value, name) {
  if (!value?.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function optionalBoolean(value) {
  return ["1", "true", "yes", "y"].includes(String(value ?? "").toLowerCase());
}

function createApiKeyPrefix(rawKey) {
  return rawKey.slice(0, 18);
}

function parseEncryptionKey(value) {
  if (!value) {
    throw new Error(
      "ENCRYPTION_KEY is required before configuring a demo webhook secret."
    );
  }

  const key = Buffer.from(value.trim(), "base64");
  const canonicalInput = value.trim().replace(/=+$/u, "");
  const canonicalKey = key.toString("base64").replace(/=+$/u, "");
  if (key.length !== 32 || canonicalInput !== canonicalKey) {
    throw new Error("ENCRYPTION_KEY must be valid base64 and decode to 32 bytes.");
  }

  return key;
}

function encryptDemoWebhookSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseEncryptionKey(process.env.ENCRYPTION_KEY), iv, {
    authTagLength: 16,
  });
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

async function main() {
  const args = parseArgs();
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, set a local PostgreSQL URL, then run migrations before setup."
    );
  }

  const rawApiKey = required(
    args["api-key"] ?? process.env.DEMO_API_KEY,
    "DEMO_API_KEY or --api-key"
  );
  if (rawApiKey.length < 24) {
    throw new Error(
      "DEMO_API_KEY is too short for a useful demo key. Use a fake local key of at least 24 characters."
    );
  }

  const orgName = args["org-name"] ?? process.env.DEMO_ORG_NAME ?? DEFAULT_ORG_NAME;
  const orgSlug = args["org-slug"] ?? process.env.DEMO_ORG_SLUG ?? DEFAULT_ORG_SLUG;
  const clientName =
    args["client-name"] ?? process.env.DEMO_CLIENT_NAME ?? DEFAULT_CLIENT_NAME;
  const dashboardEmail =
    args.email ?? process.env.DEMO_DASHBOARD_EMAIL ?? "demo-admin@example.com";
  const externalAuthId =
    args["external-auth-id"] ?? process.env.DEMO_DASHBOARD_EXTERNAL_AUTH_ID;
  const skipDashboardUser = optionalBoolean(
    args["skip-dashboard-user"] ?? process.env.DEMO_SKIP_DASHBOARD_USER
  );
  if (!externalAuthId?.trim() && !skipDashboardUser) {
    throw new Error(
      "DEMO_DASHBOARD_EXTERNAL_AUTH_ID is required for the full demo dashboard loop. Set it to the Supabase Auth user UUID, or set DEMO_SKIP_DASHBOARD_USER=true for API-only setup."
    );
  }

  const webhookUrl = args["webhook-url"] ?? process.env.DEMO_WEBHOOK_URL ?? null;
  const webhookSecret =
    args["webhook-secret"] ??
    process.env.DEMO_WEBHOOK_SECRET ??
    `whsec_demo_${randomBytes(18).toString("base64url")}`;
  const storedWebhookSecret = webhookUrl
    ? encryptDemoWebhookSecret(webhookSecret)
    : null;

  const prisma = new PrismaClient({ log: [] });

  try {
    const organization = await prisma.organization.upsert({
      where: { slug: orgSlug },
      update: { name: orgName },
      create: { name: orgName, slug: orgSlug },
    });

    let user = null;
    let membership = null;
    if (externalAuthId?.trim()) {
      user = await prisma.user.upsert({
        where: { externalAuthId: externalAuthId.trim() },
        update: { email: dashboardEmail },
        create: {
          email: dashboardEmail,
          externalAuthId: externalAuthId.trim(),
          name: "Demo Admin",
        },
      });

      membership = await prisma.organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
        update: { role: "OWNER" },
        create: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
        },
      });
    }

    const legacyHash = await bcrypt.hash(rawApiKey, BCRYPT_ROUNDS);
    const existingClient = await prisma.client.findFirst({
      where: { name: clientName },
      select: { id: true },
    });

    const client = existingClient
      ? await prisma.client.update({
          where: { id: existingClient.id },
          data: {
            organizationId: organization.id,
            apiKeyHash: legacyHash,
            status: "ACTIVE",
            webhookUrl,
            webhookSecret: storedWebhookSecret,
          },
          select: { id: true, name: true },
        })
      : await prisma.client.create({
          data: {
            organizationId: organization.id,
            name: clientName,
            apiKeyHash: legacyHash,
            status: "ACTIVE",
            webhookUrl,
            webhookSecret: storedWebhookSecret,
          },
          select: { id: true, name: true },
        });

    const apiKeyHash = await bcrypt.hash(rawApiKey, BCRYPT_ROUNDS);
    const existingApiKey = await prisma.apiKey.findFirst({
      where: {
        organizationId: organization.id,
        clientId: client.id,
        name: DEFAULT_API_KEY_NAME,
      },
      select: { id: true },
    });

    if (existingApiKey) {
      await prisma.apiKey.update({
        where: { id: existingApiKey.id },
        data: {
          apiKeyHash,
          keyPrefix: createApiKeyPrefix(rawApiKey),
          status: "ACTIVE",
          revokedAt: null,
          expiresAt: null,
          createdByUserId: user?.id ?? null,
        },
        select: { id: true },
      });
    } else {
      await prisma.apiKey.create({
        data: {
          organizationId: organization.id,
          clientId: client.id,
          name: DEFAULT_API_KEY_NAME,
          keyPrefix: createApiKeyPrefix(rawApiKey),
          apiKeyHash,
          status: "ACTIVE",
          createdByUserId: user?.id ?? null,
        },
        select: { id: true },
      });
    }

    console.log("Demo setup complete.");
    console.log(`- Organization: ${organization.name}`);
    console.log(`- Client: ${client.name}`);
    console.log("- API key: configured from DEMO_API_KEY or --api-key");
    console.log(
      externalAuthId?.trim()
        ? `- Dashboard user: ${dashboardEmail} (${membership.role})`
        : "- Dashboard user: skipped intentionally for API-only setup"
    );
    console.log(
      webhookUrl
        ? "- Webhook endpoint: configured"
        : "- Webhook endpoint: not configured; set DEMO_WEBHOOK_URL for worker live test"
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Demo setup failed: ${error.message}`);
  process.exitCode = 1;
});
