// API key authentication helper for v1 server-to-server routes.

import { db } from "@/lib/db";
import { compareHash } from "@/lib/crypto";

export type ApiAuthenticationMode = "api_key" | "legacy_client_key";

export type AuthenticatedApiClient = {
  id: string;
  organizationId: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
};

export type AuthenticatedApiContext = {
  mode: ApiAuthenticationMode;
  organizationId: string | null;
  clientId: string | null;
  apiKeyId: string | null;
  keyName: string | null;
  client: AuthenticatedApiClient | null;
};

type AuthDb = Pick<typeof db, "apiKey" | "client">;

function isApiKeyUsable(key: {
  status: string;
  expiresAt: Date | null;
}): boolean {
  return key.status === "ACTIVE" && (!key.expiresAt || key.expiresAt > new Date());
}

async function touchApiKeyLastUsed(
  prisma: AuthDb,
  apiKeyId: string
): Promise<void> {
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: new Date() },
    select: { id: true },
  });
}

/**
 * Authenticate a raw x-api-key against dashboard-managed ApiKey rows first,
 * then legacy Client.apiKeyHash rows.
 *
 * Raw API keys and hashes must never be logged or returned.
 */
export async function authenticateApiKey(
  apiKey: string,
  prisma: AuthDb = db
): Promise<AuthenticatedApiContext | null> {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      organization: {
        archivedAt: null,
      },
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      name: true,
      apiKeyHash: true,
      status: true,
      expiresAt: true,
      organization: {
        select: {
          archivedAt: true,
        },
      },
      client: {
        select: {
          id: true,
          organizationId: true,
          webhookUrl: true,
          webhookSecret: true,
          organization: {
            select: {
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  for (const key of apiKeys) {
    if (!isApiKeyUsable(key)) {
      continue;
    }

    const match = await compareHash(apiKey, key.apiKeyHash);
    if (!match) {
      continue;
    }

    if (key.client && key.client.organizationId !== key.organizationId) {
      continue;
    }

    if (key.organization.archivedAt || key.client?.organization?.archivedAt) {
      continue;
    }

    await touchApiKeyLastUsed(prisma, key.id);

    return {
      mode: "api_key",
      organizationId: key.organizationId,
      clientId: key.clientId,
      apiKeyId: key.id,
      keyName: key.name,
      client: key.client
        ? {
            id: key.client.id,
            organizationId: key.client.organizationId,
            webhookUrl: key.client.webhookUrl,
            webhookSecret: key.client.webhookSecret,
          }
        : null,
    };
  }

  const clients = await prisma.client.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { organizationId: null },
        {
          organization: {
            archivedAt: null,
          },
        },
      ],
    },
    select: {
      id: true,
      organizationId: true,
      apiKeyHash: true,
      webhookUrl: true,
      webhookSecret: true,
      organization: {
        select: {
          archivedAt: true,
        },
      },
    },
  });

  for (const client of clients) {
    if (client.organization?.archivedAt) {
      continue;
    }

    const match = await compareHash(apiKey, client.apiKeyHash);
    if (match) {
      return {
        mode: "legacy_client_key",
        organizationId: client.organizationId,
        clientId: client.id,
        apiKeyId: null,
        keyName: null,
        client: {
          id: client.id,
          organizationId: client.organizationId,
          webhookUrl: client.webhookUrl,
          webhookSecret: client.webhookSecret,
        },
      };
    }
  }

  return null;
}

/**
 * Compatibility wrapper for older route code that requires a concrete Client.
 */
export async function findClientByApiKey(
  apiKey: string,
  prisma: AuthDb = db
): Promise<AuthenticatedApiClient | null> {
  const auth = await authenticateApiKey(apiKey, prisma);
  return auth?.client ?? null;
}
