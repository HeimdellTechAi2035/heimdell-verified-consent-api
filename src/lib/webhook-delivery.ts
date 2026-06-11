import { db } from "@/lib/db";
import {
  buildWebhookPayload,
  createWebhookSignatureHeader,
  type WebhookEvent,
  type WebhookPayload,
} from "@/lib/webhooks";
import { decryptWebhookSecret } from "@/lib/webhook-secrets";

const DEFAULT_BATCH_SIZE = 10;
const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_BACKOFF_SECONDS = [60, 300, 900, 3600, 21600] as const;

type WebhookNotification = {
  id: string;
  deliveryId: string | null;
  saleId: string;
  recipient: string;
  providerId: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  sale: {
    id: string;
    clientReference: string | null;
    productName: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    client: {
      id: string;
      organizationId: string | null;
      webhookSecret: string | null;
    };
    verificationSessions: Array<{
      id: string;
      status: string;
      createdAt: Date;
      expiresAt: Date;
      completedAt: Date | null;
      declinedAt: Date | null;
      certificate: { id: string } | null;
    }>;
  };
};

type WebhookDbClient = typeof db;

export type WebhookDeliveryAttemptResult = {
  ok: boolean;
  notificationId: string;
  deliveryId: string;
  event: string | null;
  status: "SENT" | "FAILED" | "DRY_RUN" | "RETRY_SCHEDULED";
  httpStatus?: number;
  reason?: string;
  retryable: boolean;
  terminal: boolean;
  attempts: number;
  nextAttemptAt?: string;
};

export type ProcessWebhookDeliveriesParams = {
  limit?: number;
  dryRun?: boolean;
  dbClient?: WebhookDbClient;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

export type ProcessWebhookDeliveriesResult = {
  scanned: number;
  sent: number;
  failed: number;
  retryScheduled: number;
  terminalFailed: number;
  dryRun: number;
  results: WebhookDeliveryAttemptResult[];
};

const WEBHOOK_EVENTS = new Set<WebhookEvent>([
  "verification.link_created",
  "verification.completed",
  "verification.declined",
  "certificate.created",
  "webhook.test",
]);

function isWebhookEvent(value: string | null): value is WebhookEvent {
  return Boolean(value && WEBHOOK_EVENTS.has(value as WebhookEvent));
}

function getDeliveryId(notification: Pick<WebhookNotification, "id" | "deliveryId">) {
  return notification.deliveryId ?? notification.id;
}

export function getWebhookBackoffDate(
  attemptsAfterThisAttempt: number,
  now = new Date()
): Date {
  const index = Math.min(
    Math.max(attemptsAfterThisAttempt - 1, 0),
    WEBHOOK_BACKOFF_SECONDS.length - 1
  );
  return new Date(now.getTime() + WEBHOOK_BACKOFF_SECONDS[index] * 1000);
}

export function isRetryableWebhookHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isDeliverableWebhookUrl(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;

    const isLocalDev =
      env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    return isLocalDev;
  } catch {
    return false;
  }
}

export function buildPayloadForNotification(
  notification: WebhookNotification
): WebhookPayload | null {
  if (!isWebhookEvent(notification.providerId)) {
    return null;
  }

  const session = notification.sale.verificationSessions[0];

  if (!session) {
    return null;
  }

  return buildWebhookPayload({
    event: notification.providerId,
    clientId: notification.sale.client.id,
    saleId: notification.sale.id,
    clientReference: notification.sale.clientReference,
    verificationSessionId: session.id,
    certificateId: session.certificate?.id ?? null,
    status: session.status,
    data: {
      delivery_id: notification.id,
      stable_delivery_id: getDeliveryId(notification),
      organization_id: notification.sale.client.organizationId,
      product_name: notification.sale.productName,
      sale_status: notification.sale.status,
      verification_status: session.status,
      sale_created_at: notification.sale.createdAt.toISOString(),
      sale_updated_at: notification.sale.updatedAt.toISOString(),
      verification_created_at: session.createdAt.toISOString(),
      verification_expires_at: session.expiresAt.toISOString(),
      verification_completed_at: session.completedAt?.toISOString() ?? null,
      verification_declined_at: session.declinedAt?.toISOString() ?? null,
    },
  });
}

export async function deliverWebhookNotification(params: {
  notification: WebhookNotification;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}): Promise<WebhookDeliveryAttemptResult> {
  const { notification } = params;
  const event = notification.providerId;
  const attempts = notification.attempts + 1;
  const deliveryId = getDeliveryId(notification);

  const webhookSecret = decryptWebhookSecret(
    notification.sale.client.webhookSecret
  );

  if (!webhookSecret) {
    return {
      ok: false,
      notificationId: notification.id,
      deliveryId,
      event,
      status: "FAILED",
      reason: "Webhook secret is not configured",
      retryable: false,
      terminal: true,
      attempts,
    };
  }

  if (!isDeliverableWebhookUrl(notification.recipient, params.env)) {
    return {
      ok: false,
      notificationId: notification.id,
      deliveryId,
      event,
      status: "FAILED",
      reason: "Webhook URL must be HTTPS",
      retryable: false,
      terminal: true,
      attempts,
    };
  }

  const payload = buildPayloadForNotification(notification);

  if (!payload) {
    return {
      ok: false,
      notificationId: notification.id,
      deliveryId,
      event,
      status: "FAILED",
      reason: "Webhook payload could not be built",
      retryable: false,
      terminal: true,
      attempts,
    };
  }

  if (params.dryRun) {
    return {
      ok: true,
      notificationId: notification.id,
      deliveryId,
      event,
      status: "DRY_RUN",
      retryable: false,
      terminal: false,
      attempts,
    };
  }

  const body = JSON.stringify(payload);
  const signature = createWebhookSignatureHeader(
    payload,
    webhookSecret
  );
  const fetchImpl = params.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetchImpl(notification.recipient, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Heimdell-Webhook/1.0",
        "X-Heimdell-Signature": signature,
        "X-HVCS-Signature": signature,
        "X-Heimdell-Event-Type": payload.event,
        "X-Heimdell-Delivery-Id": deliveryId,
      },
      body,
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        ok: true,
        notificationId: notification.id,
        deliveryId,
        event,
        status: "SENT",
        httpStatus: response.status,
        retryable: false,
        terminal: false,
        attempts,
      };
    }

    const retryable =
      isRetryableWebhookHttpStatus(response.status) &&
      attempts < notification.maxAttempts;
    const nextAttemptAt = retryable
      ? getWebhookBackoffDate(attempts).toISOString()
      : undefined;

    return {
      ok: false,
      notificationId: notification.id,
      deliveryId,
      event,
      status: retryable ? "RETRY_SCHEDULED" : "FAILED",
      httpStatus: response.status,
      reason: `Webhook endpoint returned HTTP ${response.status}`,
      retryable,
      terminal: !retryable,
      attempts,
      nextAttemptAt,
    };
  } catch {
    const retryable = attempts < notification.maxAttempts;
    const nextAttemptAt = retryable
      ? getWebhookBackoffDate(attempts).toISOString()
      : undefined;

    return {
      ok: false,
      notificationId: notification.id,
      deliveryId,
      event,
      status: retryable ? "RETRY_SCHEDULED" : "FAILED",
      reason: "Webhook request failed",
      retryable,
      terminal: !retryable,
      attempts,
      nextAttemptAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function processWebhookDeliveries(
  params: ProcessWebhookDeliveriesParams = {}
): Promise<ProcessWebhookDeliveriesResult> {
  const dbClient = params.dbClient ?? db;
  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_BATCH_SIZE, 50));
  const now = new Date();

  const notifications = await dbClient.notification.findMany({
    where: {
      channel: "WEBHOOK",
      status: { in: ["PENDING", "QUEUED", "FAILED"] },
      deliveredAt: null,
      terminalFailureAt: null,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      deliveryId: true,
      saleId: true,
      recipient: true,
      providerId: true,
      attempts: true,
      maxAttempts: true,
      nextAttemptAt: true,
      sale: {
        select: {
          id: true,
          clientReference: true,
          productName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          client: {
            select: {
              id: true,
              organizationId: true,
              webhookSecret: true,
            },
          },
          verificationSessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              createdAt: true,
              expiresAt: true,
              completedAt: true,
              declinedAt: true,
              certificate: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  const results: WebhookDeliveryAttemptResult[] = [];

  for (const notification of notifications) {
    if (!params.dryRun && notification.attempts >= notification.maxAttempts) {
      const result: WebhookDeliveryAttemptResult = {
        ok: false,
        notificationId: notification.id,
        deliveryId: getDeliveryId(notification),
        event: notification.providerId,
        status: "FAILED",
        reason: "Webhook delivery reached maximum attempts",
        retryable: false,
        terminal: true,
        attempts: notification.attempts,
      };
      results.push(result);
      await dbClient.notification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          nextAttemptAt: null,
          terminalFailureAt: now,
          lastSafeError: result.reason,
          errorMessage: result.reason,
        },
        select: { id: true },
      });
      continue;
    }

    const result = await deliverWebhookNotification({
      notification,
      dryRun: params.dryRun,
      fetchImpl: params.fetchImpl,
      env: params.env,
    });
    results.push(result);

    if (params.dryRun) {
      continue;
    }

    await dbClient.notification.update({
      where: { id: notification.id },
      data: {
        status: result.ok ? "SENT" : result.terminal ? "FAILED" : "QUEUED",
        attempts: result.attempts,
        sentAt: result.ok ? now : null,
        deliveredAt: result.ok ? now : null,
        lastAttemptAt: now,
        lastResponseStatus: result.httpStatus ?? null,
        lastSafeError: result.ok
          ? null
          : result.reason ?? "Webhook delivery failed",
        errorMessage: result.ok
          ? null
          : result.reason ?? "Webhook delivery failed",
        nextAttemptAt:
          result.retryable && result.nextAttemptAt
            ? new Date(result.nextAttemptAt)
            : null,
        terminalFailureAt: result.terminal ? now : null,
      },
      select: { id: true },
    });
  }

  return {
    scanned: notifications.length,
    sent: results.filter((result) => result.status === "SENT").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    retryScheduled: results.filter((result) => result.status === "RETRY_SCHEDULED")
      .length,
    terminalFailed: results.filter((result) => result.terminal).length,
    dryRun: results.filter((result) => result.status === "DRY_RUN").length,
    results,
  };
}
