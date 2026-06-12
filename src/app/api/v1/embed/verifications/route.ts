import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import {
  EncryptionConfigurationError,
  encryptSensitiveValue,
  generateSecureToken,
  hashToken,
  maskAccountNumber,
} from "@/lib/crypto";
import { buildPolicySnapshotForClient } from "@/lib/client-policy";
import { sendVerificationLinkNotification } from "@/lib/notifications";
import {
  createEmbedToken,
  EmbedTokenError,
  extractBearerEmbedToken,
  verifyEmbedToken,
} from "@/lib/embed-token";
import { isAllowedEmbedRequestOrigin } from "@/lib/embed-origin";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const VERIFICATION_EXPIRY_MINUTES = 30;

const schema = z.object({
  clientReference: z.string().trim().min(1).max(120),
  sellerReference: z.string().trim().max(120).optional().nullable(),
  customer: z.object({
    fullName: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    email: z.string().trim().email().optional().nullable(),
    address: z.string().trim().min(1),
  }),
  product: z.object({
    name: z.string().trim().min(1),
    subscriptionPrice: z.coerce.number().positive(),
    subscriptionFrequency: z.string().trim().min(1),
    contractLength: z.string().trim().optional().nullable(),
    termsSummary: z.string().trim().min(1),
    policiesSummary: z.string().trim().min(1),
    salesChannel: z.enum([
      "door_to_door",
      "phone",
      "in_store",
      "online",
      "field_sales",
      "other",
    ]),
  }),
  payment: z.object({
    bankName: z.string().trim().min(1),
    sortCode: z.preprocess(
      (value) => String(value ?? "").replace(/[\s-]/g, ""),
      z.string().regex(/^\d{6}$/)
    ),
    accountNumber: z.preprocess(
      (value) => String(value ?? "").replace(/[\s-]/g, ""),
      z.string().regex(/^\d{8}$/)
    ),
    accountHolderName: z.string().trim().min(1),
  }),
  consent: z
    .object({
      coolingOffDays: z.coerce.number().int().min(1).max(365).default(14),
      aiMarketingOptIn: z.boolean().default(false),
    })
    .default({ coolingOffDays: 14, aiMarketingOptIn: false }),
});

export async function POST(request: Request) {
  if (!isAllowedEmbedRequestOrigin(request)) {
    return errors.forbidden("Embed origin is not allowed");
  }

  const token = extractBearerEmbedToken(request);
  if (!token) {
    return errors.unauthorized("Signed embed token is required");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errors.badRequest("Request body must be valid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errors.badRequest("Invalid request payload", parsed.error.flatten());
  }

  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  let claims;
  try {
    claims = verifyEmbedToken({
      token,
      expectedScope: "verification_create",
      expectedTargetId: clientId,
    });
  } catch (error) {
    if (error instanceof EmbedTokenError) {
      return errors.unauthorized("Invalid or expired embed token");
    }
    throw error;
  }

  const client = await db.client.findFirst({
    where: {
      id: claims.targetId,
      status: "ACTIVE",
      ...(claims.clientId ? { id: claims.clientId } : {}),
      organizationId: claims.organizationId,
      organization: { archivedAt: null },
    },
    select: {
      id: true,
      webhookUrl: true,
      webhookSecret: true,
    },
  });

  if (!client) {
    return errors.notFound("Embed client not found");
  }

  const input = parsed.data;
  const tokenRaw = generateSecureToken();
  const tokenHash = hashToken(tokenRaw);
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);
  const accountNumberLast4 = maskAccountNumber(input.payment.accountNumber).slice(-4);

  let encryptedAccountNumber: string;
  try {
    encryptedAccountNumber = encryptSensitiveValue(input.payment.accountNumber);
  } catch (error) {
    if (error instanceof EncryptionConfigurationError) {
      return errors.internal("Server encryption is not configured correctly.");
    }
    throw error;
  }

  const policySnapshot = await buildPolicySnapshotForClient({
    clientId: client.id,
    coolingOffDays: input.consent.coolingOffDays,
  });

  const sale = await db.sale.create({
    data: {
      clientId: client.id,
      clientReference: input.clientReference,
      agentId: input.sellerReference ?? null,
      customerName: input.customer.fullName,
      customerEmail: input.customer.email ?? null,
      customerPhone: input.customer.phone,
      customerAddress: input.customer.address,
      productName: input.product.name,
      productPrice: input.product.subscriptionPrice,
      productFrequency: input.product.subscriptionFrequency,
      productTerms: input.product.contractLength
        ? `Contract length: ${input.product.contractLength}\n\n${input.product.termsSummary}`
        : input.product.termsSummary,
      productPolicies: input.product.policiesSummary,
      salesChannel: input.product.salesChannel,
      aiMarketingOptIn: input.consent.aiMarketingOptIn,
      coolingOffDays: input.consent.coolingOffDays,
      policySnapshot,
      directDebitMandate: {
        create: {
          bankName: input.payment.bankName,
          sortCode: input.payment.sortCode,
          accountNumberLast4,
          encryptedAccountNumber,
          accountHolderName: input.payment.accountHolderName,
        },
      },
      verificationSessions: {
        create: {
          tokenHash,
          expiresAt,
        },
      },
    },
    include: {
      verificationSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  });

  const session = sale.verificationSessions[0];
  const verificationUrl = `${APP_URL}/v/${tokenRaw}`;

  sendVerificationLinkNotification({
    saleId: sale.id,
    customerPhone: sale.customerPhone ?? null,
    customerEmail: sale.customerEmail ?? null,
    verificationUrl,
    clientWebhookUrl: client.webhookUrl,
    webhookSecret: client.webhookSecret,
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    sale_id: sale.id,
    client_reference: sale.clientReference,
    verification_session_id: session.id,
    verification_status: session.status,
    expires_at: session.expiresAt.toISOString(),
    verification_url: verificationUrl,
    status_embed_token: createEmbedToken({
      scope: "verification_status",
      organizationId: claims.organizationId,
      clientId: client.id,
      targetId: session.id,
      ttlSeconds: 10 * 60,
    }).token,
    certificate_id: null,
    certificate_url: null,
  });
}
