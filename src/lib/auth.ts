// API key authentication helper for v1 server-to-server routes.

import { db } from "@/lib/db";
import { compareHash, hashToken } from "@/lib/crypto";

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

type ApiKeyRow = {
  id: string;
  organizationId: string;
  clientId: string | null;
  name: string;
  apiKeyHash: string;
  status: string;
  expiresAt: Date | null;
  organization: { archivedAt: Date | null };
  client: {
    id: string;
    organizationId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    organization: { archivedAt: Date | null } | null;
  } | null;
};

type ClientRow = {
  id: string;
  organizationId: string | null;
  apiKeyHash: string;
  status: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
  organization: { archivedAt: Date | null } | null;
};

const API_KEY_SELECT = {
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
} as const;

const CLIENT_SELECT = {
  id: true,
  organizationId: true,
  apiKeyHash: true,
  status: true,
  webhookUrl: true,
  webhookSecret: true,
  organization: {
    select: {
      archivedAt: true,
    },
  },
} as const;

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

async function tryAuthenticateApiKeyRow(
  key: ApiKeyRow,
  rawKey: string,
  prisma: AuthDb
): Promise<AuthenticatedApiContext | null> {
  if (!isApiKeyUsable(key)) {
    return null;
  }

  const match = await compareHash(rawKey, key.apiKeyHash);
  if (!match) {
    return null;
  }

  if (key.client && key.client.organizationId !== key.organizationId) {
    return null;
  }

  if (key.organization.archivedAt || key.client?.organization?.archivedAt) {
    return null;
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

function tryAuthenticateClientRow(
  client: ClientRow
): AuthenticatedApiContext | null {
  if (client.organization?.archivedAt) {
    return null;
  }

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

/**
 * Authenticate a raw x-api-key against dashboard-managed ApiKey rows first,
 * then legacy Client.apiKeyHash rows.
 *
 * Each lookup tries a fast, indexed lookupHash match first (O(1) instead of
 * a linear bcrypt scan over every active key in the system). lookupHash is
 * nullable -- rows created before it existed only ever stored their bcrypt
 * hash (bcrypt is salted/non-deterministic and can't be backfilled), so
 * those fall back to a scan bounded to just the un-migrated rows.
 *
 * Raw API keys and hashes must never be logged or returned.
 */
export async function authenticateApiKey(
  apiKey: string,
  prisma: AuthDb = db
): Promise<AuthenticatedApiContext | null> {
  const lookupHash = hashToken(apiKey);

  const fastKey = await prisma.apiKey.findUnique({
    where: { lookupHash },
    select: API_KEY_SELECT,
  });

  if (fastKey) {
    const result = await tryAuthenticateApiKeyRow(fastKey, apiKey, prisma);
    if (result) {
      return result;
    }
  }

  const legacyKeys = await prisma.apiKey.findMany({
    where: {
      lookupHash: null,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      organization: {
        archivedAt: null,
      },
    },
    select: API_KEY_SELECT,
  });

  for (const key of legacyKeys) {
    const result = await tryAuthenticateApiKeyRow(key, apiKey, prisma);
    if (result) {
      return result;
    }
  }

  const fastClient = await prisma.client.findUnique({
    where: { lookupHash },
    select: CLIENT_SELECT,
  });

  if (fastClient && fastClient.status === "ACTIVE") {
    const match = await compareHash(apiKey, fastClient.apiKeyHash);
    if (match) {
      const result = tryAuthenticateClientRow(fastClient);
      if (result) {
        return result;
      }
    }
  }

  const legacyClients = await prisma.client.findMany({
    where: {
      lookupHash: null,
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
    select: CLIENT_SELECT,
  });

  for (const client of legacyClients) {
    const match = await compareHash(apiKey, client.apiKeyHash);
    if (match) {
      const result = tryAuthenticateClientRow(client);
      if (result) {
        return result;
      }
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
