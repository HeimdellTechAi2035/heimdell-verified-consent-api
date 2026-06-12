import type { NotificationChannel, NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deliverCustomerNotification } from "@/lib/notification-delivery";
import { queueWebhookDelivery } from "@/lib/webhooks";

export type NotificationResult = {
  ok: boolean;
  notificationId?: string;
  status?: string;
  reason?: string;
};

type CreateNotificationLogParams = {
  saleId: string;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationStatus;
  notificationType: string;
  subject?: string | null;
  messagePreview?: string | null;
  errorMessage?: string | null;
  nextAttemptAt?: Date | null;
};

function safePreview(value: string) {
  return value
    .replace(/https?:\/\/\S+\/v\/\S+/gi, "[secure verification link]")
    .replace(/\b\d{6,}\b/g, "[redacted]")
    .slice(0, 500);
}

function whatsappEnabled() {
  return process.env.HEIMDELL_ENABLE_WHATSAPP === "true";
}

export async function createNotificationLog(
  params: CreateNotificationLogParams
): Promise<NotificationResult> {
  try {
    const notification = await db.notification.create({
      data: {
        saleId: params.saleId,
        channel: params.channel,
        recipient: params.recipient,
        status: params.status,
        notificationType: params.notificationType,
        subject: params.subject ?? null,
        messagePreview: params.messagePreview
          ? safePreview(params.messagePreview)
          : null,
        providerId: null,
        providerMessageId: null,
        errorMessage: params.errorMessage ?? null,
        sentAt: null,
        failedAt: null,
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: params.nextAttemptAt ?? null,
      },
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

    return {
      ok: true,
      notificationId: notification.id,
      status: notification.status,
    };
  } catch (err) {
    console.error("[notifications] failed to write log entry", {
      errorName: err instanceof Error ? err.name : "UnknownError",
    });
    return { ok: false, reason: "Database write failed" };
  }
}

async function createAndDeliverCustomerNotification(params: {
  saleId: string;
  channel: Exclude<NotificationChannel, "WEBHOOK">;
  recipient: string | null;
  notificationType: string;
  subject: string | null;
  messageBody: string;
  allowRetry: boolean;
}) {
  if (!params.recipient) {
    return createNotificationLog({
      saleId: params.saleId,
      channel: params.channel,
      recipient: "N/A",
      status: "SKIPPED",
      notificationType: params.notificationType,
      subject: params.subject,
      messagePreview: params.messageBody,
      errorMessage: `No ${params.channel.toLowerCase()} recipient is available`,
    });
  }

  const created = await db.notification.create({
    data: {
      saleId: params.saleId,
      channel: params.channel,
      recipient: params.recipient,
      status: "QUEUED",
      notificationType: params.notificationType,
      subject: params.subject,
      messagePreview: safePreview(params.messageBody),
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    },
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

  const delivered = await deliverCustomerNotification({
    notification: created,
    messageBody: params.messageBody,
    allowRetry: params.allowRetry,
  });

  return {
    ok: true,
    notificationId: created.id,
    status: delivered.status,
    reason: delivered.reason,
  };
}

export type VerificationLinkParams = {
  saleId: string;
  customerPhone: string | null;
  customerEmail: string | null;
  verificationUrl: string;
  clientWebhookUrl?: string | null;
  webhookSecret?: string | null;
};

export async function sendVerificationLinkNotification(
  params: VerificationLinkParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const subject = "Your secure Heimdell verification link";
  const body = `Please review and confirm your sale details using this secure Heimdell verification link: ${params.verificationUrl}`;

  if (!params.customerPhone && !params.customerEmail) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: "N/A",
        status: "SKIPPED",
        notificationType: "verification.link_created",
        subject,
        messagePreview: "No customer phone number or email address was available.",
        errorMessage:
          "No phone number or email address available for verification link notification",
      })
    );
  }

  if (params.customerEmail) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "EMAIL",
        recipient: params.customerEmail,
        notificationType: "verification.link_created",
        subject,
        messageBody: body,
        allowRetry: false,
      })
    );
  }

  if (params.customerPhone) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "SMS",
        recipient: params.customerPhone,
        notificationType: "verification.link_created",
        subject: null,
        messageBody: body,
        allowRetry: false,
      })
    );
  }

  if (whatsappEnabled() && params.customerPhone) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "WHATSAPP",
        recipient: params.customerPhone,
        notificationType: "verification.link_created",
        subject: null,
        messageBody: body,
        allowRetry: false,
      })
    );
  }

  results.push(
    await queueWebhookDelivery({
      saleId: params.saleId,
      event: "verification.link_created",
      clientWebhookUrl: params.clientWebhookUrl ?? null,
      webhookSecret: params.webhookSecret ?? null,
    })
  );

  return results;
}

export type VerificationCompletedParams = {
  saleId: string;
  verificationSessionId: string;
  customerPhone: string | null;
  customerEmail: string | null;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

export async function sendVerificationCompletedNotification(
  params: VerificationCompletedParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const subject = "Your Heimdell verification is complete";
  const body =
    "Your Heimdell verification has been completed and securely recorded.";

  if (params.customerEmail) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "EMAIL",
        recipient: params.customerEmail,
        notificationType: "verification.completed",
        subject,
        messageBody: body,
        allowRetry: true,
      })
    );
  } else if (params.customerPhone) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "SMS",
        recipient: params.customerPhone,
        notificationType: "verification.completed",
        subject: null,
        messageBody: body,
        allowRetry: true,
      })
    );
  } else {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: "N/A",
        status: "SKIPPED",
        notificationType: "verification.completed",
        subject,
        messagePreview: body,
        errorMessage:
          "No customer contact details for completion confirmation notification",
      })
    );
  }

  results.push(
    await queueWebhookDelivery({
      saleId: params.saleId,
      event: "verification.completed",
      clientWebhookUrl: params.clientWebhookUrl,
      webhookSecret: params.webhookSecret,
    })
  );

  return results;
}

export type CertificateCreatedParams = {
  saleId: string;
  certificateId: string;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

export async function sendCertificateCreatedNotification(
  params: CertificateCreatedParams
): Promise<NotificationResult[]> {
  return [
    await queueWebhookDelivery({
      saleId: params.saleId,
      event: "certificate.created",
      clientWebhookUrl: params.clientWebhookUrl,
      webhookSecret: params.webhookSecret,
    }),
  ];
}

export type VerificationDeclinedParams = {
  saleId: string;
  verificationSessionId: string;
  customerPhone: string | null;
  customerEmail: string | null;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

export async function sendVerificationDeclinedNotification(
  params: VerificationDeclinedParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const subject = "Your Heimdell verification was declined";
  const body =
    "Your Heimdell verification decline has been securely recorded. Contact the provider if this was unexpected.";

  results.push(
    await queueWebhookDelivery({
      saleId: params.saleId,
      event: "verification.declined",
      clientWebhookUrl: params.clientWebhookUrl,
      webhookSecret: params.webhookSecret,
    })
  );

  if (params.customerEmail) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "EMAIL",
        recipient: params.customerEmail,
        notificationType: "verification.declined",
        subject,
        messageBody: body,
        allowRetry: true,
      })
    );
  } else if (params.customerPhone) {
    results.push(
      await createAndDeliverCustomerNotification({
        saleId: params.saleId,
        channel: "SMS",
        recipient: params.customerPhone,
        notificationType: "verification.declined",
        subject: null,
        messageBody: body,
        allowRetry: true,
      })
    );
  }

  return results;
}
