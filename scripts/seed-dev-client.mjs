// This is for local development only.
// Do not use this script to generate production client keys.

// Load .env.local before PrismaClient is instantiated —
// dotenv must run before `new PrismaClient()` reads DATABASE_URL.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const BCRYPT_ROUNDS = 12;
const CLIENT_NAME = "Heimdell Dev Client";

const prisma = new PrismaClient({
  log: [], // suppress query logs — DATABASE_URL must stay private
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "\nERROR: DATABASE_URL is not set.\n" +
        "Copy .env.example to .env.local and set a valid PostgreSQL connection string.\n"
    );
    process.exit(1);
  }

  // Generate a raw API key — prefix makes it easy to identify in logs/headers.
  // 24 random bytes → 32-char base64url string (URL-safe, no padding).
  const rawKey = `hvcs_dev_${randomBytes(24).toString("base64url")}`;

  console.log("\nHashing API key — this takes a moment (bcrypt, 12 rounds)...");
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

  // Find an existing dev client by name and update, or create fresh.
  const existing = await prisma.client.findFirst({
    where: { name: CLIENT_NAME },
    select: { id: true },
  });

  let clientId;

  if (existing) {
    await prisma.client.update({
      where: { id: existing.id },
      data: {
        apiKeyHash: keyHash,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });
    clientId = existing.id;
    console.log(`\nUpdated existing dev client.`);
    console.log(`Client ID : ${clientId}`);
  } else {
    const created = await prisma.client.create({
      data: {
        name: CLIENT_NAME,
        apiKeyHash: keyHash,
        status: "ACTIVE",
        webhookUrl: null,
        webhookSecret: null,
      },
      select: { id: true },
    });
    clientId = created.id;
    console.log(`\nCreated new dev client.`);
    console.log(`Client ID : ${clientId}`);
  }

  // Print the raw key exactly once — it is never stored anywhere.
  console.log("\n" + "─".repeat(60));
  console.log("Generated API key:");
  console.log(rawKey);
  console.log("\n⚠️  Save this key now. It is not stored in plain text.");
  console.log("─".repeat(60));
  console.log("\nTo test the intake endpoint, add to .env.local:");
  console.log(`DEV_API_KEY="${rawKey}"`);
  console.log(
    "\nThen pass it as a request header:  x-api-key: " + rawKey + "\n"
  );
}

main()
  .catch((err) => {
    console.error("\nSeed failed:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
