// Phase 7 — Provider-agnostic notification layer
//
// Logs notification intent to the database; does NOT send real messages yet.
// When a real provider (Twilio, SendGrid, etc.) is connected, replace the
// QUEUED records with actual dispatch logic and update status to SENT/FAILED.
//
// Design rules:
//   - Never throw — always catch and return a structured result.
//   - Never log raw tokens, raw API keys, or account numbers.
//   - The raw verification URL is accepted as a parameter for future use but
//     is NOT stored in the database (it contains the raw token). The URL will
//     be passed directly to a provider at send-time; it is never persisted.
//   - If recipient data is missing, log status SKIPPED with a safe message.

import { db } from "@/lib/db";
import { queueWebhookDelivery } from "@/lib/webhooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationResult = {
  ok: boolean;
  notificationId?: string;
  status?: string;
  reason?: string;
};

type Channel = "SMS" | "EMAIL" | "WHATSAPP" | "WEBHOOK";
type Status = "QUEUED" | "SKIPPED" | "FAILED";

type CreateNotificationLogParams = {
  saleId: string;
  channel: Channel;
  recipient: string;
  status: Status;
  errorMessage?: string;
};

// ---------------------------------------------------------------------------
// Core log helper
// ---------------------------------------------------------------------------

/**
 * Persists a single notification record to the database.
 * Never throws — always returns a structured result.
 */
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
        errorMessage: params.errorMessage ?? null,
        providerId: null,
        sentAt: null,
      },
      select: { id: true, status: true },
    });

    return {
      ok: true,
      notificationId: notification.id,
      status: notification.status,
    };
  } catch (err) {
    console.error("[notifications] failed to write log entry:", err);
    return { ok: false, reason: "Database write failed" };
  }
}

// ---------------------------------------------------------------------------
// 1. Verification link created
// ---------------------------------------------------------------------------

export type VerificationLinkParams = {
  saleId: string;
  customerPhone: string | null;
  customerEmail: string | null;
  /**
   * The full verification URL including the raw token.
   * Passed here so the future send-time processor can include it in the
   * message body. NOT stored in the database.
   */
  verificationUrl: string;
  /** Optional — if provided, a verification.link_created webhook is queued. */
  clientWebhookUrl?: string | null;
  webhookSecret?: string | null;
};

/**
 * Queue a notification for a newly created verification link.
 * Prefers SMS if a phone number is available; falls back to email.
 */
export async function sendVerificationLinkNotification(
  params: VerificationLinkParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  if (params.customerPhone) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: params.customerPhone,
        status: "QUEUED",
      })
    );
  } else if (params.customerEmail) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "EMAIL",
        recipient: params.customerEmail,
        status: "QUEUED",
      })
    );
  } else {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: "N/A",
        status: "SKIPPED",
        errorMessage:
          "No phone number or email address available for verification link notification",
      })
    );
  }

  // Webhook — queue if both webhookUrl and webhookSecret are present
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

// ---------------------------------------------------------------------------
// 2. Verification completed
// ---------------------------------------------------------------------------

export type VerificationCompletedParams = {
  saleId: string;
  verificationSessionId: string;
  customerPhone: string | null;
  customerEmail: string | null;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

/**
 * Queue customer confirmation and client webhook notifications after a
 * verification has been completed.
 */
export async function sendVerificationCompletedNotification(
  params: VerificationCompletedParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  // Customer confirmation — prefer SMS, fall back to email
  if (params.customerPhone) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: params.customerPhone,
        status: "QUEUED",
      })
    );
  } else if (params.customerEmail) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "EMAIL",
        recipient: params.customerEmail,
        status: "QUEUED",
      })
    );
  } else {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: "N/A",
        status: "SKIPPED",
        errorMessage:
          "No customer contact details for completion confirmation notification",
      })
    );
  }

  // Signed webhook to client system
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
// ---------------------------------------------------------------------------

export type CertificateCreatedParams = {
  saleId: string;
  certificateId: string;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

/**
 * Queue a webhook notification when a Certificate is created, so the client
 * system knows it can now call GET /api/v1/certificates/:id.
 */
export async function sendCertificateCreatedNotification(
  params: CertificateCreatedParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  results.push(
    await queueWebhookDelivery({
      saleId: params.saleId,
      event: "certificate.created",
      clientWebhookUrl: params.clientWebhookUrl,
      webhookSecret: params.webhookSecret,
    })
  );

  return results;
}

// ---------------------------------------------------------------------------
// 4. Verification declined
// ---------------------------------------------------------------------------

export type VerificationDeclinedParams = {
  saleId: string;
  verificationSessionId: string;
  customerPhone: string | null;
  customerEmail: string | null;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

/**
 * Queue a client webhook notification and an optional customer notification
 * when a verification is declined.
 */
export async function sendVerificationDeclinedNotification(
  params: VerificationDeclinedParams
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  // Signed webhook to client system
  results.push(
    await queueWebhookDelivery({
      saleId: params.saleId,
      event: "verification.declined",
      clientWebhookUrl: params.clientWebhookUrl,
      webhookSecret: params.webhookSecret,
    })
  );

  // Optional customer notification
  if (params.customerPhone) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "SMS",
        recipient: params.customerPhone,
        status: "QUEUED",
      })
    );
  } else if (params.customerEmail) {
    results.push(
      await createNotificationLog({
        saleId: params.saleId,
        channel: "EMAIL",
        recipient: params.customerEmail,
        status: "QUEUED",
      })
    );
  }

  return results;
}
