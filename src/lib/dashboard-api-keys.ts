import type { ApiKeyStatus, Prisma, Role } from "@prisma/client";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashValue } from "@/lib/crypto";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export const DASHBOARD_API_KEYS_PAGE_SIZE = 20;
export const API_KEY_MANAGER_ROLES = [
  "PLATFORM_ADMIN",
  "OWNER",
] as const satisfies readonly Role[];

export type DashboardApiKeyFilters = {
  page?: number;
};

export type DashboardApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  clientId: string | null;
  clientName: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DashboardApiKeyClientOption = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
};

export type DashboardApiKeyOrganizationOption = {
  id: string;
  name: string;
  slug: string;
};

export type DashboardApiKeysData = {
  rows: DashboardApiKeyRow[];
  clients: DashboardApiKeyClientOption[];
  organizations: DashboardApiKeyOrganizationOption[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export type CreatedDashboardApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  rawKey: string;
};

type DashboardApiKeysDb = Pick<
  Prisma.TransactionClient,
  "apiKey" | "client" | "organization"
>;

export function canManageDashboardApiKeys(role: Role): boolean {
  return (API_KEY_MANAGER_ROLES as readonly Role[]).includes(role);
}

export function requireDashboardApiKeyManager(context: OrganizationContext): void {
  if (!canManageDashboardApiKeys(context.membership.role)) {
    throw new Error("Dashboard API key management requires platform admin access.");
  }
}

export function normalizeDashboardApiKeysPage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function createApiKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, 18);
}

export function generateDashboardApiKey(): string {
  return `hvcs_live_${randomBytes(24).toString("base64url")}`;
}

export function buildOrganizationApiKeysWhere(
  organizationId: string
): Prisma.ApiKeyWhereInput {
  return { organizationId };
}

export async function getDashboardApiKeysData(
  context: OrganizationContext,
  filters: DashboardApiKeyFilters = {},
  prisma: DashboardApiKeysDb = db
): Promise<DashboardApiKeysData> {
  const startedAt = nowMs();
  requireDashboardApiKeyManager(context);

  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard API keys requires organization context.");
  }

  const page = normalizeDashboardApiKeysPage(filters.page);
  const where = buildOrganizationApiKeysWhere(organizationId);

  const [totalRows, keys, clients, organizations] = await Promise.all([
    prisma.apiKey.count({ where }),
    prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DASHBOARD_API_KEYS_PAGE_SIZE,
      take: DASHBOARD_API_KEYS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        clientId: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
    prisma.client.findMany({
      where: {
        organization: {
          archivedAt: null,
        },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        organizationId: true,
        organization: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.organization.findMany({
      where: {
        archivedAt: null,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(totalRows / DASHBOARD_API_KEYS_PAGE_SIZE)
  );

  const data = {
    rows: keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      status: key.status,
      clientId: key.clientId,
      clientName: key.client?.name ?? null,
      createdBy: key.createdByUser?.name ?? key.createdByUser?.email ?? null,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    })),
    clients: clients
      .filter((client) => Boolean(client.organizationId))
      .map((client) => ({
        id: client.id,
        name: client.name,
        organizationId: client.organizationId as string,
        organizationName: client.organization?.name ?? "Unknown organization",
      })),
    organizations,
    pagination: {
      page,
      pageSize: DASHBOARD_API_KEYS_PAGE_SIZE,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };

  logDashboardTiming("api_keys.list", startedAt, {
    rows: data.rows.length,
    clients: data.clients.length,
    organizations: data.organizations.length,
    page,
  });

  return data;
}

export async function createDashboardApiKey(params: {
  context: OrganizationContext;
  name: string;
  organizationId: string;
  clientId?: string | null;
  expiresAt?: string | null;
  prisma?: DashboardApiKeysDb;
}): Promise<CreatedDashboardApiKey> {
  requireDashboardApiKeyManager(params.context);

  const prisma = params.prisma ?? db;
  const organizationId = params.organizationId;
  const name = params.name.trim().slice(0, 80);

  if (!organizationId) {
    throw new Error("Dashboard API key creation requires organization context.");
  }

  if (!name) {
    throw new Error("API key name is required.");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, archivedAt: true },
  });

  if (!organization) {
    throw new Error("Selected organization is not available.");
  }

  if (organization.archivedAt) {
    throw new Error("Archived client organizations cannot create API keys.");
  }

  if (!params.clientId) {
    throw new Error("Select a client for this intake-capable API key.");
  }

  let clientId: string | null = null;

  if (params.clientId) {
    const client = await prisma.client.findFirst({
      where: {
        id: params.clientId,
        organizationId,
        organization: {
          archivedAt: null,
        },
      },
      select: { id: true },
    });

    if (!client) {
      throw new Error(
        "Selected client is not available for this active organization."
      );
    }

    clientId = client.id;
  }

  const rawKey = generateDashboardApiKey();
  const apiKeyHash = await hashValue(rawKey);
  const keyPrefix = createApiKeyPrefix(rawKey);
  const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new Error("API key expiry date is invalid.");
  }

  const created = await prisma.apiKey.create({
    data: {
      organizationId,
      clientId,
      name,
      keyPrefix,
      apiKeyHash,
      status: "ACTIVE",
      createdByUserId: params.context.user.id,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
    },
  });

  return {
    ...created,
    rawKey,
  };
}

export async function revokeDashboardApiKey(params: {
  context: OrganizationContext;
  apiKeyId: string;
  prisma?: DashboardApiKeysDb;
}): Promise<void> {
  requireDashboardApiKeyManager(params.context);

  const prisma = params.prisma ?? db;
  const organizationId = params.context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard API key revocation requires organization context.");
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: params.apiKeyId,
      organizationId,
    },
    select: { id: true },
  });

  if (!apiKey) {
    throw new Error("API key was not found for this organization.");
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
    select: { id: true },
  });
}
