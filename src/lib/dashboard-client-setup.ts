import type { ApiKeyStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { isPlatformDashboardRole } from "@/lib/dashboard-role-policy";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";
import { getSafeWebhookDestinationHost } from "@/lib/dashboard-webhooks";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

const CLIENT_ADMIN_ROLES = new Set<Role>(["CLIENT_OWNER", "ADMIN"]);
const STAFF_ROLES = new Set<Role>([
  "CLIENT_MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
  "MANAGER",
]);

export type PlatformClientListRow = {
  organizationId: string;
  organizationName: string;
  slug: string;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  createdAt: string;
  membershipCount: number;
  clientCount: number;
  activeApiKeyCount: number;
  webhookConfigured: boolean;
  totalSales: number;
  canHardDelete: boolean;
  hardDeleteBlockers: string[];
};

export type SetupChecklistStatus = "DONE" | "MISSING" | "NEEDS_ATTENTION";

export type SetupChecklistItem = {
  key: string;
  label: string;
  status: SetupChecklistStatus;
  detail: string;
};

export type ClientSetupUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: string;
  mustChangePassword: boolean;
};

export type ClientSetupApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  clientName: string | null;
};

export type ClientSetupWebhookSummary = {
  configured: boolean;
  destinationHost: string | null;
  clientName: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  failureCount: number;
};

export type ClientSetupActivitySummary = {
  lastSaleAt: string | null;
  lastVerificationAt: string | null;
  lastCompletedVerificationAt: string | null;
  lastCertificateAt: string | null;
  totalSales: number;
  pendingSales: number;
  completedVerifications: number;
  declinedVerifications: number;
  certificates: number;
};

export type ClientSetupDetail = {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    primaryContactName: string | null;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    notes: string | null;
  };
  overallStatus: "Complete" | "Incomplete" | "Needs attention";
  recommendedNextAction: string;
  checklist: SetupChecklistItem[];
  membershipCount: number;
  client: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  } | null;
  admins: ClientSetupUserRow[];
  staff: ClientSetupUserRow[];
  apiKeys: {
    total: number;
    active: number;
    revoked: number;
    rows: ClientSetupApiKeyRow[];
  };
  webhook: ClientSetupWebhookSummary;
  activity: ClientSetupActivitySummary;
};

export function assertPlatformClientSetupAccess(context: OrganizationContext) {
  if (!isPlatformDashboardRole(context.membership.role)) {
    throw new Error("Client setup pages require platform admin access.");
  }
}

export type PlatformClientListFilters = {
  archived?: boolean;
};

export async function getPlatformClientSetupList(
  context: OrganizationContext,
  filters: PlatformClientListFilters = {}
): Promise<PlatformClientListRow[]> {
  const startedAt = nowMs();
  assertPlatformClientSetupAccess(context);

  const organizations = await db.organization.findMany({
    where: filters.archived
      ? { archivedAt: { not: null }, onboardingStatus: "APPROVED" }
      : { archivedAt: null, onboardingStatus: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      archivedAt: true,
      createdAt: true,
      _count: {
        select: {
          clients: true,
          memberships: true,
          apiKeys: true,
        },
      },
      clients: {
        select: {
          id: true,
          webhookUrl: true,
        },
      },
      apiKeys: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });

  const safetyByOrganization = await getClientHardDeleteSafetyBulk(
    organizations.map((organization) => ({
      organizationId: organization.id,
      clientIds: organization.clients.map((client) => client.id),
    }))
  );

  const rows: PlatformClientListRow[] = organizations.map((organization) => {
    const hardDeleteSafety = safetyByOrganization.get(organization.id) ?? {
      canDelete: true,
      blockers: [],
      counts: {
        sales: 0,
        verificationSessions: 0,
        certificates: 0,
        webhookDeliveries: 0,
        activeApiKeys: 0,
      },
    };

    return {
      organizationId: organization.id,
      organizationName: organization.name,
      slug: organization.slug,
      status: organization.archivedAt ? "ARCHIVED" : "ACTIVE",
      archivedAt: organization.archivedAt?.toISOString() ?? null,
      createdAt: organization.createdAt.toISOString(),
      membershipCount: organization._count.memberships,
      clientCount: organization._count.clients,
      activeApiKeyCount: organization.apiKeys.length,
      webhookConfigured: organization.clients.some((client) =>
        Boolean(client.webhookUrl)
      ),
      totalSales: hardDeleteSafety.counts.sales,
      canHardDelete: hardDeleteSafety.canDelete,
      hardDeleteBlockers: hardDeleteSafety.blockers,
    };
  });

  logDashboardTiming("clients.list", startedAt, {
    rows: rows.length,
    archived: Boolean(filters.archived),
  });

  return rows;
}

export async function archiveClientOrganization(params: {
  context: OrganizationContext;
  organizationId: string;
}): Promise<void> {
  assertPlatformClientSetupAccess(params.context);
  await assertNotCurrentOrganization(params.context, params.organizationId);

  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: { id: true, archivedAt: true },
  });

  if (!organization) {
    throw new Error("Client organization was not found.");
  }

  if (organization.archivedAt) {
    return;
  }

  await db.organization.update({
    where: { id: organization.id },
    data: {
      archivedAt: new Date(),
      archivedByUserId: params.context.user.id,
    },
    select: { id: true },
  });

  await logDashboardAuditEvent({
    organizationId: organization.id,
    userId: params.context.user.id,
    action: "client_archived",
    entityType: "organization",
    entityId: organization.id,
  });
}

export async function restoreClientOrganization(params: {
  context: OrganizationContext;
  organizationId: string;
}): Promise<void> {
  assertPlatformClientSetupAccess(params.context);

  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: { id: true, archivedAt: true },
  });

  if (!organization) {
    throw new Error("Client organization was not found.");
  }

  if (!organization.archivedAt) {
    return;
  }

  await db.organization.update({
    where: { id: organization.id },
    data: {
      archivedAt: null,
      archivedByUserId: null,
    },
    select: { id: true },
  });

  await logDashboardAuditEvent({
    organizationId: organization.id,
    userId: params.context.user.id,
    action: "client_restored",
    entityType: "organization",
    entityId: organization.id,
  });
}

export async function hardDeleteTestClientOrganization(params: {
  context: OrganizationContext;
  organizationId: string;
  confirmation: string;
}): Promise<{ deleted: boolean; blockers: string[] }> {
  assertPlatformClientSetupAccess(params.context);
  await assertNotCurrentOrganization(params.context, params.organizationId);

  if (params.confirmation !== "DELETE") {
    throw new Error("Type DELETE to confirm hard deletion.");
  }

  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: { id: true, name: true },
  });

  if (!organization) {
    throw new Error("Client organization was not found.");
  }

  const safety = await getClientHardDeleteSafety(organization.id);

  if (!safety.canDelete) {
    await logDashboardAuditEvent({
      organizationId: organization.id,
      userId: params.context.user.id,
      action: "client_hard_delete_blocked",
      entityType: "organization",
      entityId: organization.id,
      metadata: {
        blockers: safety.blockers.join(", "),
      },
    });

    return { deleted: false, blockers: safety.blockers };
  }

  await logDashboardAuditEvent({
    organizationId: params.context.organization.id,
    userId: params.context.user.id,
    action: "client_hard_deleted",
    entityType: "organization",
    entityId: organization.id,
    metadata: {
      deletedOrganizationName: organization.name,
    },
  });

  await db.$transaction(async (tx) => {
    await tx.apiKey.deleteMany({ where: { organizationId: organization.id } });
    await tx.clientPolicy.deleteMany({
      where: { client: { organizationId: organization.id } },
    });
    await tx.client.deleteMany({ where: { organizationId: organization.id } });
    await tx.organizationMembership.deleteMany({
      where: { organizationId: organization.id },
    });
    await tx.auditLog.deleteMany({ where: { organizationId: organization.id } });
    await tx.organization.delete({ where: { id: organization.id } });
  });

  return { deleted: true, blockers: [] };
}

type HardDeleteSafetyCounts = {
  sales: number;
  verificationSessions: number;
  certificates: number;
  webhookDeliveries: number;
  activeApiKeys: number;
};

type HardDeleteSafety = {
  canDelete: boolean;
  blockers: string[];
  counts: HardDeleteSafetyCounts;
};

function buildHardDeleteSafety(counts: HardDeleteSafetyCounts): HardDeleteSafety {
  const { sales, verificationSessions, certificates, webhookDeliveries, activeApiKeys } =
    counts;

  const blockers = [
    sales > 0 ? `${sales} sale${sales === 1 ? "" : "s"}` : null,
    verificationSessions > 0
      ? `${verificationSessions} verification session${
          verificationSessions === 1 ? "" : "s"
        }`
      : null,
    certificates > 0
      ? `${certificates} certificate${certificates === 1 ? "" : "s"}`
      : null,
    webhookDeliveries > 0
      ? `${webhookDeliveries} webhook deliver${
          webhookDeliveries === 1 ? "y" : "ies"
        }`
      : null,
    activeApiKeys > 0
      ? `${activeApiKeys} active API key${activeApiKeys === 1 ? "" : "s"}`
      : null,
  ].filter((blocker): blocker is string => Boolean(blocker));

  return { canDelete: blockers.length === 0, blockers, counts };
}

async function getClientHardDeleteSafety(
  organizationId: string
): Promise<HardDeleteSafety> {
  const clientWhere = { client: { organizationId } };
  const verificationWhere = { sale: clientWhere };
  const certificateWhere = { verificationSession: { sale: clientWhere } };
  const notificationWhere = {
    channel: "WEBHOOK" as const,
    sale: clientWhere,
  };

  const [
    sales,
    verificationSessions,
    certificates,
    webhookDeliveries,
    activeApiKeys,
  ] = await Promise.all([
    db.sale.count({ where: clientWhere }),
    db.verificationSession.count({ where: verificationWhere }),
    db.certificate.count({ where: certificateWhere }),
    db.notification.count({ where: notificationWhere }),
    db.apiKey.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);

  return buildHardDeleteSafety({
    sales,
    verificationSessions,
    certificates,
    webhookDeliveries,
    activeApiKeys,
  });
}

/**
 * Bulk equivalent of getClientHardDeleteSafety for list pages -- computes
 * safety for every organization with a fixed number of queries instead of
 * 5 queries per organization (was O(orgs), now O(1)).
 */
async function getClientHardDeleteSafetyBulk(
  organizationClients: { organizationId: string; clientIds: string[] }[]
): Promise<Map<string, HardDeleteSafety>> {
  const allClientIds = organizationClients.flatMap((entry) => entry.clientIds);
  const organizationIds = organizationClients.map((entry) => entry.organizationId);

  const clientIdToOrganizationId = new Map<string, string>();
  for (const entry of organizationClients) {
    for (const clientId of entry.clientIds) {
      clientIdToOrganizationId.set(clientId, entry.organizationId);
    }
  }

  const [sales, activeApiKeyGroups] = await Promise.all([
    allClientIds.length > 0
      ? db.sale.findMany({
          where: { clientId: { in: allClientIds } },
          select: { id: true, clientId: true },
        })
      : [],
    organizationIds.length > 0
      ? db.apiKey.groupBy({
          by: ["organizationId"],
          where: { organizationId: { in: organizationIds }, status: "ACTIVE" },
          _count: { _all: true },
        })
      : [],
  ]);

  const saleIdToClientId = new Map(sales.map((sale) => [sale.id, sale.clientId]));
  const allSaleIds = sales.map((sale) => sale.id);

  const [verificationSessions, notifications] = await Promise.all([
    allSaleIds.length > 0
      ? db.verificationSession.findMany({
          where: { saleId: { in: allSaleIds } },
          select: { id: true, saleId: true },
        })
      : [],
    allSaleIds.length > 0
      ? db.notification.findMany({
          where: { channel: "WEBHOOK", saleId: { in: allSaleIds } },
          select: { saleId: true },
        })
      : [],
  ]);

  const verificationSessionIdToSaleId = new Map(
    verificationSessions.map((session) => [session.id, session.saleId])
  );
  const allVerificationSessionIds = verificationSessions.map((session) => session.id);

  const certificates =
    allVerificationSessionIds.length > 0
      ? await db.certificate.findMany({
          where: { verificationSessionId: { in: allVerificationSessionIds } },
          select: { verificationSessionId: true },
        })
      : [];

  const salesByOrganization = new Map<string, number>();
  for (const sale of sales) {
    const organizationId = clientIdToOrganizationId.get(sale.clientId);
    if (!organizationId) continue;
    salesByOrganization.set(organizationId, (salesByOrganization.get(organizationId) ?? 0) + 1);
  }

  const verificationSessionsByOrganization = new Map<string, number>();
  for (const session of verificationSessions) {
    const clientId = saleIdToClientId.get(session.saleId);
    const organizationId = clientId ? clientIdToOrganizationId.get(clientId) : undefined;
    if (!organizationId) continue;
    verificationSessionsByOrganization.set(
      organizationId,
      (verificationSessionsByOrganization.get(organizationId) ?? 0) + 1
    );
  }

  const certificatesByOrganization = new Map<string, number>();
  for (const certificate of certificates) {
    const saleId = verificationSessionIdToSaleId.get(certificate.verificationSessionId);
    const clientId = saleId ? saleIdToClientId.get(saleId) : undefined;
    const organizationId = clientId ? clientIdToOrganizationId.get(clientId) : undefined;
    if (!organizationId) continue;
    certificatesByOrganization.set(
      organizationId,
      (certificatesByOrganization.get(organizationId) ?? 0) + 1
    );
  }

  const notificationsByOrganization = new Map<string, number>();
  for (const notification of notifications) {
    const clientId = saleIdToClientId.get(notification.saleId);
    const organizationId = clientId ? clientIdToOrganizationId.get(clientId) : undefined;
    if (!organizationId) continue;
    notificationsByOrganization.set(
      organizationId,
      (notificationsByOrganization.get(organizationId) ?? 0) + 1
    );
  }

  const activeApiKeysByOrganization = new Map(
    activeApiKeyGroups.map((group) => [group.organizationId, group._count._all])
  );

  const result = new Map<string, HardDeleteSafety>();
  for (const { organizationId } of organizationClients) {
    result.set(
      organizationId,
      buildHardDeleteSafety({
        sales: salesByOrganization.get(organizationId) ?? 0,
        verificationSessions: verificationSessionsByOrganization.get(organizationId) ?? 0,
        certificates: certificatesByOrganization.get(organizationId) ?? 0,
        webhookDeliveries: notificationsByOrganization.get(organizationId) ?? 0,
        activeApiKeys: activeApiKeysByOrganization.get(organizationId) ?? 0,
      })
    );
  }

  return result;
}

async function assertNotCurrentOrganization(
  context: OrganizationContext,
  organizationId: string
): Promise<void> {
  const protectedCurrentOrganizationId =
    await getProtectedCurrentOrganizationId(context);

  if (protectedCurrentOrganizationId === organizationId) {
    throw new Error("You cannot archive or delete your current dashboard organization.");
  }
}

async function getProtectedCurrentOrganizationId(
  context: OrganizationContext
): Promise<string> {
  const platformMembership = await db.organizationMembership.findFirst({
    where: {
      userId: context.user.id,
      role: {
        in: ["PLATFORM_ADMIN", "OWNER"],
      },
    },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  return platformMembership?.organizationId ?? context.organization.id;
}

export async function getPlatformClientSetupDetail(params: {
  context: OrganizationContext;
  organizationId: string;
}): Promise<ClientSetupDetail | null> {
  assertPlatformClientSetupAccess(params.context);

  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryContactName: true,
      primaryContactEmail: true,
      primaryContactPhone: true,
      notes: true,
      createdAt: true,
      clients: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          webhookUrl: true,
          createdAt: true,
        },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mustChangePassword: true,
            },
          },
        },
      },
      apiKeys: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          status: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          client: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!organization) {
    return null;
  }

  const primaryClient = organization.clients[0] ?? null;
  const clientWhere = { client: { organizationId: organization.id } };
  const verificationWhere = { sale: clientWhere };
  const certificateWhere = {
    verificationSession: {
      sale: clientWhere,
    },
  };
  const notificationWhere = {
    channel: "WEBHOOK" as const,
    sale: clientWhere,
  };

  const [
    totalSales,
    pendingSales,
    verificationCount,
    completedVerifications,
    declinedVerifications,
    certificateCount,
    lastSale,
    lastVerification,
    lastCompletedVerification,
    lastCertificate,
    lastWebhookNotification,
    failedWebhookCount,
  ] = await Promise.all([
    db.sale.count({ where: clientWhere }),
    db.sale.count({ where: { ...clientWhere, status: { in: ["PENDING", "VERIFICATION_SENT"] } } }),
    db.verificationSession.count({ where: verificationWhere }),
    db.verificationSession.count({
      where: { ...verificationWhere, status: "COMPLETED" },
    }),
    db.verificationSession.count({
      where: { ...verificationWhere, status: "DECLINED" },
    }),
    db.certificate.count({ where: certificateWhere }),
    db.sale.findFirst({
      where: clientWhere,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.verificationSession.findFirst({
      where: verificationWhere,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.verificationSession.findFirst({
      where: { ...verificationWhere, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.certificate.findFirst({
      where: certificateWhere,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.notification.findFirst({
      where: notificationWhere,
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        deliveredAt: true,
        lastAttemptAt: true,
        terminalFailureAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({
      where: { ...notificationWhere, status: "FAILED" },
    }),
  ]);

  const admins = organization.memberships
    .filter((membership) => CLIENT_ADMIN_ROLES.has(membership.role))
    .map(toUserRow);
  const staff = organization.memberships
    .filter((membership) => STAFF_ROLES.has(membership.role))
    .map(toUserRow);
  const activeApiKeys = organization.apiKeys.filter(
    (key) => key.status === "ACTIVE"
  );
  const revokedApiKeys = organization.apiKeys.filter(
    (key) => key.status === "REVOKED"
  );
  const webhookClient = organization.clients.find((client) =>
    Boolean(client.webhookUrl)
  );
  const webhookLastDeliveryAt =
    lastWebhookNotification?.deliveredAt ??
    lastWebhookNotification?.terminalFailureAt ??
    lastWebhookNotification?.lastAttemptAt ??
    lastWebhookNotification?.createdAt ??
    null;

  const checklist = buildChecklist({
    organizationExists: true,
    clientExists: Boolean(primaryClient),
    clientAdminExists: admins.length > 0,
    staffExists: staff.length > 0,
    activeApiKeyExists: activeApiKeys.length > 0,
    webhookConfigured: Boolean(webhookClient),
    saleExists: totalSales > 0,
    verificationExists: verificationCount > 0,
    certificateExists: certificateCount > 0,
  });

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt.toISOString(),
      primaryContactName: organization.primaryContactName,
      primaryContactEmail: organization.primaryContactEmail,
      primaryContactPhone: organization.primaryContactPhone,
      notes: organization.notes,
    },
    overallStatus: getOverallStatus(checklist),
    recommendedNextAction: getRecommendedNextAction(checklist),
    checklist,
    membershipCount: organization.memberships.length,
    client: primaryClient
      ? {
          id: primaryClient.id,
          name: primaryClient.name,
          status: primaryClient.status,
          createdAt: primaryClient.createdAt.toISOString(),
        }
      : null,
    admins,
    staff,
    apiKeys: {
      total: organization.apiKeys.length,
      active: activeApiKeys.length,
      revoked: revokedApiKeys.length,
      rows: organization.apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        status: key.status,
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        expiresAt: key.expiresAt?.toISOString() ?? null,
        revokedAt: key.revokedAt?.toISOString() ?? null,
        clientName: key.client?.name ?? null,
      })),
    },
    webhook: {
      configured: Boolean(webhookClient),
      destinationHost: getSafeWebhookDestinationHost(
        webhookClient?.webhookUrl ?? null
      ),
      clientName: webhookClient?.name ?? null,
      lastDeliveryStatus: lastWebhookNotification?.status ?? null,
      lastDeliveryAt: webhookLastDeliveryAt?.toISOString() ?? null,
      failureCount: failedWebhookCount,
    },
    activity: {
      lastSaleAt: lastSale?.createdAt.toISOString() ?? null,
      lastVerificationAt: lastVerification?.createdAt.toISOString() ?? null,
      lastCompletedVerificationAt:
        lastCompletedVerification?.completedAt?.toISOString() ?? null,
      lastCertificateAt: lastCertificate?.createdAt.toISOString() ?? null,
      totalSales,
      pendingSales,
      completedVerifications,
      declinedVerifications,
      certificates: certificateCount,
    },
  };
}

function toUserRow(membership: {
  id: string;
  role: Role;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    mustChangePassword: boolean;
  };
}): ClientSetupUserRow {
  return {
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    mustChangePassword: membership.user.mustChangePassword,
  };
}

function buildChecklist(flags: {
  organizationExists: boolean;
  clientExists: boolean;
  clientAdminExists: boolean;
  staffExists: boolean;
  activeApiKeyExists: boolean;
  webhookConfigured: boolean;
  saleExists: boolean;
  verificationExists: boolean;
  certificateExists: boolean;
}): SetupChecklistItem[] {
  return [
    checklistItem("organization", "Organisation exists", flags.organizationExists),
    checklistItem("client", "Client row exists", flags.clientExists),
    checklistItem("client-admin", "Client admin exists", flags.clientAdminExists),
    checklistItem("staff", "At least one staff/seller exists", flags.staffExists),
    checklistItem("api-key", "At least one active API key exists", flags.activeApiKeyExists),
    checklistItem("webhook", "Webhook endpoint configured", flags.webhookConfigured),
    checklistItem("sale", "At least one sale intake received", flags.saleExists),
    checklistItem("verification", "At least one verification session exists", flags.verificationExists),
    checklistItem("certificate", "At least one completed verification/certificate exists", flags.certificateExists),
  ];
}

function checklistItem(
  key: string,
  label: string,
  isDone: boolean
): SetupChecklistItem {
  return {
    key,
    label,
    status: isDone ? "DONE" : "MISSING",
    detail: isDone ? "Done" : "Missing",
  };
}

function getOverallStatus(
  checklist: SetupChecklistItem[]
): ClientSetupDetail["overallStatus"] {
  const missingCount = checklist.filter((item) => item.status !== "DONE").length;
  if (missingCount === 0) return "Complete";
  if (missingCount <= 2) return "Needs attention";
  return "Incomplete";
}

function getRecommendedNextAction(checklist: SetupChecklistItem[]): string {
  const firstMissing = checklist.find((item) => item.status !== "DONE");

  switch (firstMissing?.key) {
    case "client":
      return "Create or backfill a Client row.";
    case "client-admin":
      return "Create a client admin.";
    case "staff":
      return "Create a staff or seller user.";
    case "api-key":
      return "Create an intake-capable API key.";
    case "webhook":
      return "Configure a webhook endpoint.";
    case "sale":
      return "Send the first test sale.";
    case "verification":
      return "Open the customer verification link.";
    case "certificate":
      return "Complete the first customer verification.";
    default:
      return "Client setup is complete.";
  }
}
