import type { NotificationChannel, NotificationStatus, VerificationMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { deliverCustomerNotification } from "@/lib/notification-delivery";
import { initiateVerificationCall } from "@/lib/notification-providers";
import { normalizePhoneToE164 } from "@/lib/phone-number";
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

function formatPrice(price: string, frequency: string | null): string {
  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(price));
  return frequency ? `${amount} / ${frequency}` : amount;
}

/** Never shows more than the last two digits -- consistent with the dashboard and the phone agent, neither of which expose a full sort code either. */
function maskSortCode(sortCode: string): string {
  const digits = sortCode.replace(/\D/g, "");
  return digits.length >= 2 ? `**-**-${digits.slice(-2)}` : "**-**-**";
}

export type VerificationCompletedSaleSummary = {
  customerName: string;
  customerAddress: string | null;
  productName: string;
  productPrice: string;
  productFrequency: string | null;
  productTerms: string | null;
  productPolicies: string | null;
  directDebitMandate: { bankName: string; sortCode: string; accountNumberLast4: string } | null;
};

/**
 * Full plain-text summary of exactly what the customer confirmed, for the
 * completion email -- previously this email said nothing beyond "you're
 * verified", leaving the customer with no record of what they'd agreed to.
 * Kept as plain text (no HTML template exists yet, see sendEmailNotification)
 * but formatted with clear line breaks for readability.
 */
function buildCompletionSummaryBody(sale: VerificationCompletedSaleSummary, completedAt: Date): string {
  const lines: string[] = [
    "Thank you -- your verification has been completed and securely recorded. Here is a summary of what you confirmed:",
    "",
    `Name: ${sale.customerName}`,
  ];

  if (sale.customerAddress) {
    lines.push(`Address: ${sale.customerAddress}`);
  }

  lines.push(`Product: ${sale.productName}`);
  lines.push(`Price: ${formatPrice(sale.productPrice, sale.productFrequency)}`);

  if (sale.productTerms) {
    lines.push(`Terms: ${sale.productTerms}`);
  }

  if (sale.productPolicies) {
    lines.push(`Policies: ${sale.productPolicies}`);
  }

  if (sale.directDebitMandate) {
    const dd = sale.directDebitMandate;
    lines.push(
      `Direct Debit: ${dd.bankName}, sort code ${maskSortCode(dd.sortCode)}, account ending ${dd.accountNumberLast4}`
    );
  }

  lines.push("");
  lines.push(
    `Completed: ${completedAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" })}`
  );
  lines.push("");
  lines.push("If any of this is incorrect, please contact the provider you signed up with.");

  return lines.join("\n");
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

async function initiatePhoneVerificationCall(params: {
  verificationSessionId: string;
  token: string;
  customerPhone: string;
}): Promise<NotificationResult> {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const fromNumber = process.env.TWILIO_VOICE_FROM ?? process.env.TWILIO_SMS_FROM;

  if (!fromNumber) {
    return { ok: false, reason: "Voice provider phone number is not configured" };
  }

  // Twilio requires E.164 (e.g. "+447418008279") and rejects anything else --
  // normalize here so a customer number typed as "07418008279" still dials
  // correctly instead of silently failing at the provider.
  const toNumber = normalizePhoneToE164(params.customerPhone);
  if (!toNumber) {
    return { ok: false, reason: `Customer phone number could not be normalized for calling: ${params.customerPhone}` };
  }

  const attempt = await db.phoneVerificationAttempt.create({
    data: {
      verificationSessionId: params.verificationSessionId,
      toPhone: toNumber,
      fromPhone: fromNumber,
      status: "QUEUED",
    },
    select: { id: true },
  });

  const result = await initiateVerificationCall({
    to: toNumber,
    from: fromNumber,
    twimlUrl: `${appUrl}/api/v1/voice/verification/${params.token}/twiml`,
    statusCallbackUrl: `${appUrl}/api/v1/voice/verification/${params.token}/status`,
    recordingStatusCallbackUrl: `${appUrl}/api/v1/voice/verification/${params.token}/recording-status`,
  });

  if (result.status === "initiated") {
    await db.phoneVerificationAttempt.update({
      where: { id: attempt.id },
      data: { providerCallSid: result.providerCallSid, status: "INITIATED" },
    });
    return { ok: true, notificationId: attempt.id, status: "INITIATED" };
  }

  await db.phoneVerificationAttempt.update({
    where: { id: attempt.id },
    data: {
      status: result.status === "skipped" ? "CANCELED" : "FAILED",
      errorMessage: result.reason,
    },
  });

  return { ok: false, notificationId: attempt.id, reason: result.reason };
}

export type VerificationLinkParams = {
  saleId: string;
  verificationSessionId: string;
  token: string;
  method: VerificationMethod;
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

  // The link keeps working regardless of method -- a phone call is placed
  // in addition, never instead of, the link above.
  if (params.method === "PHONE_CALL" && params.customerPhone) {
    results.push(
      await initiatePhoneVerificationCall({
        verificationSessionId: params.verificationSessionId,
        token: params.token,
        customerPhone: params.customerPhone,
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
  sale: VerificationCompletedSaleSummary;
  completedAt: Date;
};

export async function sendVerificationCompletedNotification(
  params: VerificationCompletedParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const subject = "Your Heimdell verification is complete";
  // The email gets the full confirmed-details summary; SMS stays short --
  // a full breakdown would run to several SMS segments (extra cost per
  // send) and phones don't render long multi-line text well anyway.
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
        messageBody: buildCompletionSummaryBody(params.sale, params.completedAt),
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
