import { randomBytes } from "crypto";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { roleCanAccessDashboardSection } from "@/lib/dashboard-role-policy";
import { getSafeWebhookDestinationHost } from "@/lib/dashboard-webhooks";
import {
  encryptWebhookSecret,
  getWebhookSecretFingerprint,
  isEncryptedWebhookSecret,
  maskWebhookSecretForDisplay,
} from "@/lib/webhook-secrets";

type DashboardWebhookSettingsDb = Pick<Prisma.TransactionClient, "client">;

export type DashboardWebhookEndpointRow = {
  clientId: string;
  clientName: string;
  enabled: boolean;
  destinationHost: string | null;
  signingSecretConfigured: boolean;
  signingSecretFingerprint: string | null;
  signingSecretDisplay: string | null;
  signingSecretStorage: "encrypted" | "legacy_plaintext" | "none";
  createdAt: string;
  updatedAt: string;
  lastSuccessfulDeliveryAt: string | null;
  lastFailureAt: string | null;
};

export type DashboardWebhookSettingsData = {
  rows: DashboardWebhookEndpointRow[];
  canManage: boolean;
};

export type WebhookSettingsMutationResult =
  | {
      ok: true;
      clientId: string;
      message: string;
      oneTimeSecret?: string;
    }
  | { ok: false; message: string };

const MANAGE_WEBHOOK_ROLES = new Set<Role>(["PLATFORM_ADMIN", "OWNER"]);

export function canManageWebhookSettings(role: Role): boolean {
  return MANAGE_WEBHOOK_ROLES.has(role);
}

export function assertCanViewWebhookSettings(role: Role): void {
  if (!roleCanAccessDashboardSection(role, "integrations")) {
    throw new Error("Dashboard integrations access denied.");
  }
}

export function assertCanManageWebhookSettings(role: Role): void {
  if (!canManageWebhookSettings(role)) {
    throw new Error("Webhook endpoint management requires platform admin access.");
  }
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function validateWebhookEndpointUrl(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, message: "Webhook URL is required." };
  }

  try {
    const url = new URL(trimmed);
    const isHttps = url.protocol === "https:";
    const isLocalDev =
      env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (!isHttps && !isLocalDev) {
      return {
        ok: false,
        message: "Webhook URL must use HTTPS in production.",
      };
    }

    url.hash = "";
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, message: "Webhook URL is invalid." };
  }
}

function mostRecentDate(values: Array<Date | null | undefined>): Date | null {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

export async function getDashboardWebhookSettingsData(
  context: OrganizationContext,
  prisma: DashboardWebhookSettingsDb = db
): Promise<DashboardWebhookSettingsData> {
  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard webhook settings requires organization context.");
  }

  assertCanViewWebhookSettings(context.membership.role);

  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      organization: {
        archivedAt: null,
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      webhookUrl: true,
      webhookSecret: true,
      createdAt: true,
      updatedAt: true,
      sales: {
        select: {
          notifications: {
            where: { channel: "WEBHOOK" },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              deliveredAt: true,
              terminalFailureAt: true,
              lastAttemptAt: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return {
    canManage: canManageWebhookSettings(context.membership.role),
    rows: clients.map((client) => {
      const notifications = client.sales.flatMap((sale) => sale.notifications);
      const lastSuccessfulDeliveryAt = mostRecentDate(
        notifications
          .filter((notification) => notification.status === "SENT")
          .map((notification) => notification.deliveredAt)
      );
      const lastFailureAt = mostRecentDate(
        notifications
          .filter((notification) => notification.status === "FAILED")
          .map(
            (notification) =>
              notification.terminalFailureAt ?? notification.lastAttemptAt
          )
      );

      return {
        clientId: client.id,
        clientName: client.name,
        enabled: Boolean(client.webhookUrl && client.webhookSecret),
        destinationHost: getSafeWebhookDestinationHost(client.webhookUrl),
        signingSecretConfigured: Boolean(client.webhookSecret),
        signingSecretFingerprint: getWebhookSecretFingerprint(client.webhookSecret),
        signingSecretDisplay: maskWebhookSecretForDisplay(client.webhookSecret),
        signingSecretStorage: client.webhookSecret
          ? isEncryptedWebhookSecret(client.webhookSecret)
            ? "encrypted"
            : "legacy_plaintext"
          : "none",
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
        lastSuccessfulDeliveryAt:
          lastSuccessfulDeliveryAt?.toISOString() ?? null,
        lastFailureAt: lastFailureAt?.toISOString() ?? null,
      };
    }),
  };
}

export async function upsertClientWebhookEndpoint(params: {
  context: OrganizationContext;
  clientId: string;
  webhookUrl: string;
  rotateSecret?: boolean;
  prisma?: DashboardWebhookSettingsDb;
  env?: NodeJS.ProcessEnv;
}): Promise<WebhookSettingsMutationResult> {
  assertCanManageWebhookSettings(params.context.membership.role);

  const validated = validateWebhookEndpointUrl(params.webhookUrl, params.env);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }

  const prisma = params.prisma ?? db;
  const client = await prisma.client.findFirst({
    where: {
      id: params.clientId,
      organizationId: params.context.organization.id,
      organization: {
        archivedAt: null,
      },
    },
    select: { id: true, webhookSecret: true },
  });

  if (!client) {
    return {
      ok: false,
      message: "Webhook endpoint was not found for an active organization.",
    };
  }

  const shouldGenerateSecret = params.rotateSecret || !client.webhookSecret;
  const oneTimeSecret = shouldGenerateSecret ? generateWebhookSecret() : undefined;

  await prisma.client.update({
    where: { id: client.id },
    data: {
      webhookUrl: validated.url,
      ...(oneTimeSecret
        ? { webhookSecret: encryptWebhookSecret(oneTimeSecret) }
        : {}),
    },
    select: { id: true },
  });

  return {
    ok: true,
    clientId: client.id,
    message: oneTimeSecret
      ? "Webhook endpoint saved. Store the signing secret now; it will not be shown again."
      : "Webhook endpoint saved.",
    ...(oneTimeSecret ? { oneTimeSecret } : {}),
  };
}

export async function disableClientWebhookEndpoint(params: {
  context: OrganizationContext;
  clientId: string;
  prisma?: DashboardWebhookSettingsDb;
}): Promise<WebhookSettingsMutationResult> {
  assertCanManageWebhookSettings(params.context.membership.role);

  const prisma = params.prisma ?? db;
  const client = await prisma.client.findFirst({
    where: {
      id: params.clientId,
      organizationId: params.context.organization.id,
      organization: {
        archivedAt: null,
      },
    },
    select: { id: true },
  });

  if (!client) {
    return {
      ok: false,
      message: "Webhook endpoint was not found for an active organization.",
    };
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { webhookUrl: null },
    select: { id: true },
  });

  return {
    ok: true,
    clientId: client.id,
    message: "Webhook endpoint disabled. Delivery history was preserved.",
  };
}
