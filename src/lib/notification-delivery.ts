import type { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  sendEmailNotification,
  sendSmsNotification,
  sendWhatsAppNotification,
  type ProviderSendResult,
} from "@/lib/notification-providers";

type NotificationDeliveryDb = Pick<
  Prisma.TransactionClient,
  "notification"
>;

type CustomerNotification = {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  messagePreview: string | null;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
};

export type NotificationDeliveryResult = {
  notificationId: string;
  status: NotificationStatus;
  retryScheduled: boolean;
  reason?: string;
};

function safeFailure(value: string) {
  return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240);
}

function retryDelay(attempts: number) {
  const minutes = Math.min(60, Math.max(2, attempts * attempts * 2));
  return new Date(Date.now() + minutes * 60 * 1000);
}

function unsupportedChannel(channel: NotificationChannel): ProviderSendResult {
  return {
    status: "skipped",
    reason: `${channel} delivery is not supported by the customer notification worker`,
  };
}

async function callProvider(params: {
  notification: CustomerNotification;
  messageBody: string;
}): Promise<ProviderSendResult> {
  const providerParams = {
    recipient: params.notification.recipient,
    subject: params.notification.subject,
    body: params.messageBody,
  };

  switch (params.notification.channel) {
    case "EMAIL":
      return sendEmailNotification(providerParams);
    case "SMS":
      return sendSmsNotification(providerParams);
    case "WHATSAPP":
      return sendWhatsAppNotification(providerParams);
    default:
      return unsupportedChannel(params.notification.channel);
  }
}

export async function deliverCustomerNotification(params: {
  notification: CustomerNotification;
  messageBody?: string;
  allowRetry?: boolean;
  dbClient?: NotificationDeliveryDb;
}): Promise<NotificationDeliveryResult> {
  const dbClient = params.dbClient ?? db;
  const { notification } = params;

  if (notification.status === "SENT" || notification.status === "SKIPPED") {
    return {
      notificationId: notification.id,
      status: notification.status,
      retryScheduled: false,
    };
  }

  const attempts = notification.attempts + 1;
  const messageBody = params.messageBody ?? notification.messagePreview;

  if (!messageBody) {
    await dbClient.notification.update({
      where: { id: notification.id },
      data: {
        status: "SKIPPED",
        attempts,
        lastAttemptAt: new Date(),
        errorMessage: "Message body is not available for delivery",
        lastSafeError: "Message body is not available for delivery",
      },
    });
    return {
      notificationId: notification.id,
      status: "SKIPPED",
      retryScheduled: false,
      reason: "Message body unavailable",
    };
  }

  await dbClient.notification.update({
    where: { id: notification.id },
    data: {
      status: "SENDING",
      attempts,
      lastAttemptAt: new Date(),
      lastSafeError: null,
    },
  });

  const providerResult = await callProvider({ notification, messageBody });

  if (providerResult.status === "sent") {
    await dbClient.notification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        providerMessageId: providerResult.providerMessageId,
        sentAt: new Date(),
        deliveredAt: new Date(),
        nextAttemptAt: null,
        errorMessage: null,
        lastSafeError: null,
      },
    });
    return {
      notificationId: notification.id,
      status: "SENT",
      retryScheduled: false,
    };
  }

  if (providerResult.status === "skipped") {
    const reason = safeFailure(providerResult.reason);
    await dbClient.notification.update({
      where: { id: notification.id },
      data: {
        status: "SKIPPED",
        nextAttemptAt: null,
        errorMessage: reason,
        lastSafeError: reason,
      },
    });
    return {
      notificationId: notification.id,
      status: "SKIPPED",
      retryScheduled: false,
      reason,
    };
  }

  const reason = safeFailure(providerResult.reason);
  const retryable =
    params.allowRetry !== false &&
    providerResult.retryable &&
    attempts < notification.maxAttempts;
  await dbClient.notification.update({
    where: { id: notification.id },
    data: {
      status: "FAILED",
      failedAt: retryable ? null : new Date(),
      terminalFailureAt: retryable ? null : new Date(),
      nextAttemptAt: retryable ? retryDelay(attempts) : null,
      errorMessage: reason,
      lastSafeError: reason,
    },
  });

  return {
    notificationId: notification.id,
    status: "FAILED",
    retryScheduled: retryable,
    reason,
  };
}

export async function processCustomerNotificationDeliveries(params: {
  dbClient?: NotificationDeliveryDb;
  limit?: number;
  dryRun?: boolean;
}) {
  const dbClient = params.dbClient ?? db;
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 100);
  const now = new Date();
  const notifications = await dbClient.notification.findMany({
    where: {
      channel: { in: ["EMAIL", "SMS", "WHATSAPP"] },
      OR: [
        { status: "QUEUED" },
        { status: "FAILED", nextAttemptAt: { lte: now } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      channel: true,
      recipient: true,
      subject: true,
      messagePreview: true,
      status: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  if (params.dryRun) {
    return {
      scanned: notifications.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      retryScheduled: 0,
      dryRun: true,
    };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let retryScheduled = 0;

  for (const notification of notifications) {
    const result = await deliverCustomerNotification({
      notification,
      dbClient,
    });

    if (result.status === "SENT") sent += 1;
    if (result.status === "FAILED") failed += 1;
    if (result.status === "SKIPPED") skipped += 1;
    if (result.retryScheduled) retryScheduled += 1;
  }

  return {
    scanned: notifications.length,
    sent,
    failed,
    skipped,
    retryScheduled,
    dryRun: false,
  };
}
