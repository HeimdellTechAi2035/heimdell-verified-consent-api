import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { roleCanAccessDashboardSection } from "@/lib/dashboard-role-policy";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export const DASHBOARD_WEBHOOKS_PAGE_SIZE = 20;

export type DashboardWebhooksFilters = {
  page?: number;
  status?: string | null;
  eventType?: string | null;
  search?: string | null;
};

export type DashboardWebhookRow = {
  id: string;
  deliveryId: string;
  eventType: string;
  status: string;
  saleId: string;
  clientReference: string;
  verificationSessionId: string | null;
  certificateId: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  lastResponseStatus: number | null;
  lastSafeError: string | null;
  deliveredAt: string | null;
  terminalFailureAt: string | null;
  createdAt: string;
  destinationHost: string | null;
};

export type DashboardWebhooksData = {
  rows: DashboardWebhookRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    status: string | null;
    eventType: string | null;
    search: string | null;
  };
};

type DashboardWebhooksDb = Pick<Prisma.TransactionClient, "notification">;

const ALLOWED_WEBHOOK_STATUSES = new Set([
  "PENDING",
  "QUEUED",
  "SENT",
  "SKIPPED",
  "FAILED",
]);

const ALLOWED_WEBHOOK_EVENTS = new Set([
  "verification.link_created",
  "verification.completed",
  "verification.declined",
  "certificate.created",
  "webhook.test",
]);

export function normalizeDashboardWebhooksPage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function normalizeDashboardWebhooksSearch(
  search?: string | null
): string | null {
  const normalized = search?.trim();
  return normalized ? normalized.slice(0, 80) : null;
}

export function normalizeDashboardWebhooksStatus(
  status?: string | null
): string | null {
  const normalized = status?.trim().toUpperCase();
  return normalized && ALLOWED_WEBHOOK_STATUSES.has(normalized)
    ? normalized
    : null;
}

export function normalizeDashboardWebhooksEventType(
  eventType?: string | null
): string | null {
  const normalized = eventType?.trim();
  return normalized && ALLOWED_WEBHOOK_EVENTS.has(normalized)
    ? normalized
    : null;
}

export function getSafeWebhookDestinationHost(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return "Invalid URL";
  }
}

export function assertCanViewDashboardWebhooks(role: Role): void {
  if (!roleCanAccessDashboardSection(role, "webhooks")) {
    throw new Error("Dashboard webhooks access denied.");
  }
}

export function buildOrganizationWebhooksWhere(params: {
  organizationId: string;
  status?: string | null;
  eventType?: string | null;
  search?: string | null;
}): Prisma.NotificationWhereInput {
  return {
    channel: "WEBHOOK",
    sale: {
      client: {
        organizationId: params.organizationId,
      },
    },
    ...(params.status ? { status: params.status as Prisma.EnumNotificationStatusFilter<"Notification"> } : {}),
    ...(params.eventType ? { providerId: params.eventType } : {}),
    ...(params.search
      ? {
          OR: [
            {
              saleId: {
                contains: params.search,
                mode: "insensitive",
              },
            },
            {
              sale: {
                clientReference: {
                  contains: params.search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };
}

export async function getDashboardWebhooksData(
  context: OrganizationContext,
  filters: DashboardWebhooksFilters = {},
  prisma: DashboardWebhooksDb = db
): Promise<DashboardWebhooksData> {
  const startedAt = nowMs();
  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard webhooks requires organization context.");
  }

  assertCanViewDashboardWebhooks(context.membership.role);

  const page = normalizeDashboardWebhooksPage(filters.page);
  const status = normalizeDashboardWebhooksStatus(filters.status);
  const eventType = normalizeDashboardWebhooksEventType(filters.eventType);
  const search = normalizeDashboardWebhooksSearch(filters.search);
  const where = buildOrganizationWebhooksWhere({
    organizationId,
    status,
    eventType,
    search,
  });

  const [totalRows, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DASHBOARD_WEBHOOKS_PAGE_SIZE,
      take: DASHBOARD_WEBHOOKS_PAGE_SIZE,
      select: {
        id: true,
        deliveryId: true,
        providerId: true,
        status: true,
        saleId: true,
        recipient: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastAttemptAt: true,
        lastResponseStatus: true,
        lastSafeError: true,
        deliveredAt: true,
        terminalFailureAt: true,
        createdAt: true,
        sale: {
          select: {
            id: true,
            clientReference: true,
            verificationSessions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                certificate: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(totalRows / DASHBOARD_WEBHOOKS_PAGE_SIZE)
  );

  const data = {
    rows: notifications.map((notification) => {
      const latestSession = notification.sale.verificationSessions[0] ?? null;

      return {
        id: notification.id,
        deliveryId: notification.deliveryId ?? notification.id,
        eventType: notification.providerId ?? "unknown",
        status: notification.status,
        saleId: notification.sale.id,
        clientReference:
          notification.sale.clientReference ?? "Unreferenced sale",
        verificationSessionId: latestSession?.id ?? null,
        certificateId: latestSession?.certificate?.id ?? null,
        attempts: notification.attempts,
        maxAttempts: notification.maxAttempts,
        nextAttemptAt: notification.nextAttemptAt?.toISOString() ?? null,
        lastAttemptAt: notification.lastAttemptAt?.toISOString() ?? null,
        lastResponseStatus: notification.lastResponseStatus,
        lastSafeError: notification.lastSafeError,
        deliveredAt: notification.deliveredAt?.toISOString() ?? null,
        terminalFailureAt:
          notification.terminalFailureAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
        destinationHost: getSafeWebhookDestinationHost(notification.recipient),
      };
    }),
    pagination: {
      page,
      pageSize: DASHBOARD_WEBHOOKS_PAGE_SIZE,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    filters: {
      status,
      eventType,
      search,
    },
  };

  logDashboardTiming("webhooks.list", startedAt, {
    rows: data.rows.length,
    totalRows,
    page,
  });

  return data;
}
