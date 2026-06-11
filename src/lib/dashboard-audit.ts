import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type DashboardAuditEvent = {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type DashboardPageAccessAuditDraft = {
  action: "dashboard.page_access_allowed" | "dashboard.page_access_denied";
  organizationId: string;
  userId: string;
  entityType: "dashboard_page";
  entityId: string;
  metadata: {
    section: string;
    role: string;
  };
};

export function prepareDashboardPageAccessAuditEvent(params: {
  section: string;
  outcome: "allowed" | "denied";
  organizationId: string;
  userId: string;
  role: string;
}): DashboardPageAccessAuditDraft {
  return {
    action:
      params.outcome === "allowed"
        ? "dashboard.page_access_allowed"
        : "dashboard.page_access_denied",
    organizationId: params.organizationId,
    userId: params.userId,
    entityType: "dashboard_page",
    entityId: params.section,
    metadata: {
      section: params.section,
      role: params.role,
    },
  };
}

export async function logDashboardAuditEvent(
  event: DashboardAuditEvent
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: event.organizationId,
      userId: event.userId ?? null,
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    },
  });
}
