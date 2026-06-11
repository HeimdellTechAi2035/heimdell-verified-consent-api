// Phase 8 — Signed webhook payload generation and delivery queuing.
//
// HTTP delivery is implemented separately in src/lib/webhook-delivery.ts.
// This phase provides:
//   - Deterministic, safely shaped payload construction
//   - HMAC-SHA256 signing with the client's webhookSecret
//   - Database logging via the existing Notification model (WEBHOOK channel)
//
// The delivery worker:
//   1. Query WEBHOOK Notification records with status=QUEUED
//   2. Use providerId (event type) + sale/session data to rebuild the payload
//   3. Call buildWebhookPayload() + createWebhookSignatureHeader()
//   4. POST to recipient (webhookUrl) with signed webhook headers
//   5. Update Notification.status → SENT or FAILED + set sentAt
//
// Security rules enforced here:
//   - webhookSecret is NEVER logged.
//   - Signed payload is NOT stored in the database (no metadata column).
//   - Full account numbers, tokenHash, apiKeyHash, encryptedAccountNumber
//     must NEVER appear in the data map passed to buildWebhookPayload().

import { randomUUID, createHmac } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | "verification.link_created"
  | "verification.completed"
  | "verification.declined"
  | "certificate.created"
  | "webhook.test";

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export type WebhookPayloadData = Record<
  string,
  string | number | boolean | null | undefined
>;

export type WebhookPayload = {
  event: WebhookEvent;
  /** UUIDv4 — unique per delivery attempt. */
  event_id: string;
  created_at: string;
  client_id: string;
  sale_id: string;
  client_reference: string | null;
  verification_session_id: string;
  certificate_id?: string | null;
  status: string;
  data: WebhookPayloadData;
};

export type BuildWebhookPayloadParams = {
  event: WebhookEvent;
  clientId: string;
  saleId: string;
  clientReference: string | null;
  verificationSessionId: string;
  certificateId?: string | null;
  status: string;
  data: WebhookPayloadData;
};

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

/**
 * Construct a safe, consistently shaped webhook payload.
 *
 * Security: the caller must NEVER pass tokenHash, apiKeyHash,
 * encryptedAccountNumber, raw token, raw API key, or full account
 * numbers into the data map.
 */
export function buildWebhookPayload(
  params: BuildWebhookPayloadParams
): WebhookPayload {
  const payload: WebhookPayload = {
    event: params.event,
    event_id: randomUUID(),
    created_at: new Date().toISOString(),
    client_id: params.clientId,
    sale_id: params.saleId,
    client_reference: params.clientReference,
    verification_session_id: params.verificationSessionId,
    status: params.status,
    data: params.data,
  };

  if (params.certificateId != null) {
    payload.certificate_id = params.certificateId;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign a webhook payload with HMAC-SHA256.
 * Returns the raw hex digest (without the sha256= prefix).
 *
 * The payload is serialised with JSON.stringify. Field order matters for
 * verification — recipients must verify against the raw request body bytes,
 * not a re-serialised object.
 *
 * Security: webhookSecret is NEVER logged.
 */
export function signWebhookPayload(
  payload: WebhookPayload,
  webhookSecret: string
): string {
  return createHmac("sha256", webhookSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Build the value for the x-hvcs-signature request header.
 * Format: sha256=<hex_digest>
 *
 * Recipients should verify using timingSafeEqual:
 *   const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
 *   const match = timingSafeEqual(
 *     Buffer.from(header.slice(7), "hex"),
 *     Buffer.from(expected, "hex")
 *   );
 */
export function createWebhookSignatureHeader(
  payload: WebhookPayload,
  secret: string
): string {
  return `sha256=${signWebhookPayload(payload, secret)}`;
}

// ---------------------------------------------------------------------------
// Delivery queue
// ---------------------------------------------------------------------------

export type WebhookDeliveryResult = {
  ok: boolean;
  notificationId?: string;
  status?: string;
  reason?: string;
};

export type QueueWebhookDeliveryParams = {
  saleId: string;
  event: WebhookEvent;
  clientWebhookUrl: string | null;
  webhookSecret: string | null;
};

/**
 * Log a webhook delivery intent to the Notification table.
 *
 * Status logic:
 *   QUEUED  — webhookUrl + webhookSecret both present; ready for delivery worker
 *   SKIPPED — webhookUrl missing (client has no webhook configured)
 *   SKIPPED — webhookUrl present but webhookSecret missing (cannot sign payload)
 *
 * The signed payload is NOT stored in the database (no metadata JSON column
 * in the current schema). The delivery worker will re-build the payload from
 * the event type (stored as providerId) + sale/session data at dispatch time.
 *
 * NOTE: Actual HTTP delivery is deliberately not implemented here.
 */
export async function queueWebhookDelivery(
  params: QueueWebhookDeliveryParams
): Promise<WebhookDeliveryResult> {
  if (!params.clientWebhookUrl) {
    // No webhook URL configured — not an error, just nothing to do
    return { ok: true, status: "SKIPPED", reason: "No webhook URL configured" };
  }

  try {
    const notification = await db.notification.create({
      data: {
        saleId: params.saleId,
        channel: "WEBHOOK",
        recipient: params.clientWebhookUrl,
        status: params.webhookSecret ? "QUEUED" : "SKIPPED",
        // Store event type as hint so the delivery worker knows what to build
        providerId: params.event,
        errorMessage: params.webhookSecret
          ? null
          : "Webhook URL configured but no webhook secret is set — payload cannot be signed",
        sentAt: null,
        deliveryId: randomUUID(),
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: params.webhookSecret ? new Date() : null,
        lastAttemptAt: null,
        lastResponseStatus: null,
        lastSafeError: null,
        deliveredAt: null,
        terminalFailureAt: null,
      },
      select: { id: true, status: true },
    });

    return {
      ok: true,
      notificationId: notification.id,
      status: notification.status,
    };
  } catch (err) {
    console.error("[webhooks] failed to queue delivery:", err);
    return { ok: false, reason: "Database write failed" };
  }
}
