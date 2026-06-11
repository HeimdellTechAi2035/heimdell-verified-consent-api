#!/usr/bin/env node
// Idempotently creates one placeholder Client row for organizations that lack one.
// Does not print raw placeholder secrets or hashes.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const BCRYPT_ROUNDS = 12;

function generatePlaceholderSecret() {
  return `hvcs_placeholder_${randomBytes(32).toString("base64url")}`;
}

async function createPlaceholderHash() {
  return bcrypt.hash(generatePlaceholderSecret(), BCRYPT_ROUNDS);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Configure .env.local before running backfill."
    );
  }

  const prisma = new PrismaClient({ log: [] });

  try {
    const organizations = await prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        clients: {
          select: { id: true },
          take: 1,
        },
      },
    });

    let createdCount = 0;
    let skippedCount = 0;
    const createdNames = [];

    for (const organization of organizations) {
      if (organization.clients.length > 0) {
        skippedCount += 1;
        continue;
      }

      await prisma.client.create({
        data: {
          organizationId: organization.id,
          name: `${organization.name} Client`,
          apiKeyHash: await createPlaceholderHash(),
          status: "ACTIVE",
        },
        select: { id: true },
      });

      createdCount += 1;
      createdNames.push(organization.name);
    }

    const testTelecom = await prisma.organization.findFirst({
      where: { name: "Test Telecom Ltd" },
      select: {
        id: true,
        clients: {
          select: {
            id: true,
            name: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    console.log("Organization Client backfill complete.");
    console.log(`- Created Client rows: ${createdCount}`);
    console.log(`- Skipped organizations with existing Client rows: ${skippedCount}`);
    if (createdNames.length > 0) {
      console.log(`- Created for: ${createdNames.join(", ")}`);
    }
    console.log(
      testTelecom?.clients.length
        ? `- Test Telecom Ltd Client status: present (${testTelecom.clients[0].name})`
        : "- Test Telecom Ltd Client status: organization not found or still missing Client"
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Organization Client backfill failed: ${error.message}`);
  process.exitCode = 1;
});
