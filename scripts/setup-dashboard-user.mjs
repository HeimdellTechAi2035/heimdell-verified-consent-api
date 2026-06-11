#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

export const DASHBOARD_SETUP_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
];

const ARG_TO_FIELD = {
  "org-name": "organizationName",
  "org-slug": "organizationSlug",
  email: "email",
  "external-auth-id": "externalAuthId",
  name: "name",
  role: "role",
  "client-id": "clientId",
  "client-name": "clientName",
  "link-dev-client": "linkDevClient",
};

function normalizeBoolean(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

export function parseDashboardSetupArgs(argv = process.argv.slice(2)) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const [rawName, inlineValue] = current.slice(2).split("=", 2);
    const fieldName = ARG_TO_FIELD[rawName];

    if (!fieldName) {
      continue;
    }

    if (fieldName === "linkDevClient") {
      parsed[fieldName] = inlineValue ?? true;
      continue;
    }

    parsed[fieldName] = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return parsed;
}

export function buildDashboardSetupInput(env = process.env, argv = []) {
  const args = parseDashboardSetupArgs(argv);

  return {
    organizationName: args.organizationName ?? env.DASHBOARD_ORG_NAME,
    organizationSlug: args.organizationSlug ?? env.DASHBOARD_ORG_SLUG,
    email: args.email ?? env.DASHBOARD_USER_EMAIL,
    externalAuthId:
      args.externalAuthId ?? env.DASHBOARD_USER_EXTERNAL_AUTH_ID,
    name: args.name ?? env.DASHBOARD_USER_NAME,
    role: (args.role ?? env.DASHBOARD_USER_ROLE)?.toUpperCase(),
    clientId: args.clientId ?? env.DASHBOARD_LINK_CLIENT_ID,
    clientName: args.clientName ?? env.DASHBOARD_LINK_CLIENT_NAME,
    linkDevClient: normalizeBoolean(
      args.linkDevClient ?? env.DASHBOARD_LINK_DEV_CLIENT
    ),
  };
}

export function validateDashboardSetupInput(input) {
  const errors = [];

  if (!input.organizationName?.trim()) {
    errors.push("DASHBOARD_ORG_NAME or --org-name is required.");
  }

  if (!input.organizationSlug?.trim()) {
    errors.push("DASHBOARD_ORG_SLUG or --org-slug is required.");
  }

  if (!input.email?.trim()) {
    errors.push("DASHBOARD_USER_EMAIL or --email is required.");
  }

  if (!input.externalAuthId?.trim()) {
    errors.push(
      "DASHBOARD_USER_EXTERNAL_AUTH_ID or --external-auth-id is required."
    );
  }

  if (!input.role || !DASHBOARD_SETUP_ROLES.includes(input.role)) {
    errors.push(
      `DASHBOARD_USER_ROLE or --role must be one of: ${DASHBOARD_SETUP_ROLES.join(
        ", "
      )}.`
    );
  }

  if (input.clientId && input.clientName) {
    errors.push("Use either --client-id or --client-name, not both.");
  }

  return errors;
}

async function findOrCreateUser(prisma, input) {
  const existingByExternalId = await prisma.user.findUnique({
    where: { externalAuthId: input.externalAuthId },
  });

  if (existingByExternalId) {
    return prisma.user.update({
      where: { id: existingByExternalId.id },
      data: {
        email: input.email,
        name: input.name?.trim() || existingByExternalId.name,
      },
    });
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingByEmail?.externalAuthId) {
    throw new Error(
      "A user with this email already has a different external auth identity."
    );
  }

  if (existingByEmail) {
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        externalAuthId: input.externalAuthId,
        name: input.name?.trim() || existingByEmail.name,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: input.email,
      externalAuthId: input.externalAuthId,
      name: input.name?.trim() || null,
    },
  });
}

async function linkOptionalClient(prisma, input, organizationId) {
  if (!input.clientId && !input.clientName && !input.linkDevClient) {
    return { status: "skipped" };
  }

  const client = input.clientId
    ? await prisma.client.findUnique({ where: { id: input.clientId } })
    : await prisma.client.findFirst({
        where: input.clientName ? { name: input.clientName } : {},
        orderBy: { createdAt: "asc" },
      });

  if (!client) {
    return { status: "not_found" };
  }

  if (client.organizationId === organizationId) {
    return { status: "already_linked", clientName: client.name };
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { organizationId },
  });

  return { status: "linked", clientName: client.name };
}

export async function setupDashboardUser(prisma, input) {
  const organization = await prisma.organization.upsert({
    where: { slug: input.organizationSlug },
    update: { name: input.organizationName },
    create: {
      name: input.organizationName,
      slug: input.organizationSlug,
    },
  });

  const user = await findOrCreateUser(prisma, input);

  const membership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: { role: input.role },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: input.role,
    },
  });

  const clientLink = await linkOptionalClient(
    prisma,
    input,
    organization.id
  );

  return { organization, user, membership, clientLink };
}

async function main() {
  dotenv.config({ path: ".env.local" });
  dotenv.config();

  const input = buildDashboardSetupInput(process.env, process.argv.slice(2));
  const errors = validateDashboardSetupInput(input);

  if (errors.length > 0) {
    console.error("Dashboard user setup failed validation:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const result = await setupDashboardUser(prisma, input);

    console.log("Dashboard user setup complete.");
    console.log(`- Organization: ${result.organization.name}`);
    console.log(`- User: ${result.user.email}`);
    console.log(`- Role: ${result.membership.role}`);

    if (result.clientLink.status === "linked") {
      console.log(`- Client linked: ${result.clientLink.clientName}`);
    } else if (result.clientLink.status === "already_linked") {
      console.log(`- Client already linked: ${result.clientLink.clientName}`);
    } else if (result.clientLink.status === "not_found") {
      console.log("- Client link skipped: matching client was not found.");
    } else {
      console.log("- Client link skipped: no client selector provided.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Dashboard user setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
