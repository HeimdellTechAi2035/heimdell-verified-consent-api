import type { NotificationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";

export type DashboardNotificationRow = {
  id: string;
  channel: string;
  recipient: string;
  notificationType: string;
  subject: string | null;
  messagePreview: string | null;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
  nextAttemptAt: string | null;
  safeError: string | null;
  saleId: string;
  clientReference: string;
  customerName: string;
  verificationSessionId: string | null;
  certificateId: string | null;
};

type DashboardNotificationsDb = Pick<Prisma.TransactionClient, "notification">;

const STATUSES = [
  "PENDING",
  "QUEUED",
  "SENDING",
  "SENT",
  "SKIPPED",
  "FAILED",
] as const satisfies readonly NotificationStatus[];

export function normalizeDashboardNotificationStatus(
  status?: string | null
): NotificationStatus | null {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return STATUSES.includes(normalized as NotificationStatus)
    ? (normalized as NotificationStatus)
    : null;
}

export async function getDashboardNotificationsData(
  context: OrganizationContext,
  filters: { status?: NotificationStatus | null } = {},
  prisma: DashboardNotificationsDb = db
): Promise<DashboardNotificationRow[]> {
  const notifications = await prisma.notification.findMany({
    where: {
      sale: {
        client: {
          organizationId: context.organization.id,
        },
      },
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      channel: true,
      recipient: true,
      status: true,
      notificationType: true,
      subject: true,
      messagePreview: true,
      providerId: true,
      errorMessage: true,
      lastSafeError: true,
      attempts: true,
      maxAttempts: true,
      createdAt: true,
      sentAt: true,
      failedAt: true,
      terminalFailureAt: true,
      nextAttemptAt: true,
      sale: {
        select: {
          id: true,
          clientReference: true,
          customerName: true,
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
  });

  return notifications.map((notification) => {
    const session = notification.sale.verificationSessions[0] ?? null;

    return {
      id: notification.id,
      channel: notification.channel,
      recipient: notification.recipient,
      notificationType:
        notification.notificationType ??
        notification.providerId ??
        "notification",
      subject: notification.subject,
      messagePreview: notification.messagePreview,
      status: notification.status,
      attempts: notification.attempts,
      maxAttempts: notification.maxAttempts,
      createdAt: notification.createdAt.toISOString(),
      sentAt: notification.sentAt?.toISOString() ?? null,
      failedAt:
        notification.failedAt?.toISOString() ??
        notification.terminalFailureAt?.toISOString() ??
        null,
      nextAttemptAt: notification.nextAttemptAt?.toISOString() ?? null,
      safeError: notification.lastSafeError ?? notification.errorMessage,
      saleId: notification.sale.id,
      clientReference:
        notification.sale.clientReference ?? "Unreferenced sale",
      customerName: notification.sale.customerName,
      verificationSessionId: session?.id ?? null,
      certificateId: session?.certificate?.id ?? null,
    };
  });
}
