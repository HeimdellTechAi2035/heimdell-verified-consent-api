// Phase 2 — Sale intake endpoint
// POST /api/v1/sales/intake
//
// Flow:
//   1. Check x-api-key header presence
//   2. Parse and validate JSON body with saleIntakeSchema
//   3. Authenticate client via findClientByApiKey (bcrypt hash comparison)
//   4. Create Sale + DirectDebitMandate + VerificationSession atomically
//   5. Return verification_url with the raw token (never stored)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saleIntakeSchema } from "@/lib/validation";
import { errors } from "@/lib/errors";
import { authenticateApiKey } from "@/lib/auth";
import {
  EncryptionConfigurationError,
  encryptSensitiveValue,
  generateSecureToken,
  hashToken,
  maskAccountNumber,
} from "@/lib/crypto";
import { sendVerificationLinkNotification } from "@/lib/notifications";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";
import type { Role } from "@prisma/client";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const SALE_OWNER_ROLES = [
  "SELLER",
  "CLIENT_MANAGER",
  "CLIENT_OWNER",
  "ADMIN",
  "MANAGER",
] as const satisfies readonly Role[];

export async function POST(req: NextRequest) {
  // ------------------------------------------------------------------
  // 1. API key presence check — fast rejection before any parsing
  // ------------------------------------------------------------------
  const apiKey = req.headers.get("x-api-key");
  const preAuthLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyPreAuth,
    route: "POST /api/v1/sales/intake",
    identifiers: [apiKey ? safeFingerprint(apiKey, 16) : "missing-api-key"],
  });
  if (preAuthLimited) return preAuthLimited;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing API key" },
      { status: 401 }
    );
  }

  // ------------------------------------------------------------------
  // 2. Parse JSON body
  // ------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errors.badRequest("Request body must be valid JSON");
  }

  // ------------------------------------------------------------------
  // 3. Validate and normalise with Zod
  //    - phone trimmed
  //    - sort_code / account_number stripped of spaces and hyphens
  //    - email empty string → undefined
  // ------------------------------------------------------------------
  const parsed = saleIntakeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errors.badRequest("Invalid request payload", parsed.error.flatten());
  }
  const data = parsed.data;

  // ------------------------------------------------------------------
  // 4. Authenticate client (bcrypt comparison — intentionally slow)
  // ------------------------------------------------------------------
  const auth = await authenticateApiKey(apiKey);
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "Invalid, revoked, or expired API key" },
      { status: 401 }
    );
  }

  if (!auth.client) {
    return errors.forbidden(
      "API key is not linked to a client for sale intake"
    );
  }

  const client = auth.client;

  const clientLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyAuthenticated,
    route: "POST /api/v1/sales/intake:client",
    identifiers: [auth.clientId ?? auth.organizationId ?? "api-key"],
  });
  if (clientLimited) return clientLimited;

  // ------------------------------------------------------------------
  // 5. Create records
  // ------------------------------------------------------------------
  try {
    const submittedByUserId = await resolveSubmittedByUserId({
      sellerEmail: data.seller_email,
      organizationId: client.organizationId,
    });

    if (data.seller_email && !submittedByUserId) {
      return errors.badRequest(
        "seller_email is not valid for this organization"
      );
    }

    const token = generateSecureToken();
    // SHA-256: deterministic, so the session can be found by hashing the URL token.
    // bcrypt must NOT be used here — it is non-deterministic (salted).
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const { direct_debit } = data;

    // Store only last 4 digits in plain text; full number is encrypted at rest.
    const accountNumberLast4 = maskAccountNumber(
      direct_debit.account_number
    ).slice(-4);
    let encryptedAccountNumber: string;
    try {
      encryptedAccountNumber = encryptSensitiveValue(
        direct_debit.account_number
      );
    } catch (err) {
      if (err instanceof EncryptionConfigurationError) {
        console.error("[sales/intake] encryption is not configured correctly");
        return errors.internal(
          "Server encryption is not configured correctly. Check ENCRYPTION_KEY."
        );
      }
      throw err;
    }

    // Prisma nested create — Sale + DirectDebitMandate + VerificationSession
    // are written in a single implicit database transaction.
    const sale = await db.sale.create({
      data: {
        clientId: client.id,
        clientReference: data.client_reference,
        agentId: data.agent_id,
        submittedByUserId,

        // Customer
        customerName: data.customer.full_name,
        customerEmail: data.customer.email,
        customerPhone: data.customer.phone,
        customerAddress: data.customer.address,

        // Product
        productName: data.product.name,
        productPrice: parseFloat(data.product.subscription_price),
        productFrequency: data.product.subscription_frequency,
        productTerms: data.product.subscription_terms_summary,
        productPolicies: data.product.policies_summary,
        salesChannel: data.sales_channel ?? null,
        aiMarketingOptIn: data.consent?.ai_marketing_opt_in ?? null,
        coolingOffDays: data.consent?.cooling_off_days ?? null,

        // Status defaults to PENDING via schema

        directDebitMandate: {
          create: {
            bankName: direct_debit.bank_name,
            sortCode: direct_debit.sort_code,
            accountNumberLast4,
            encryptedAccountNumber,
            accountHolderName: direct_debit.account_holder_name,
          },
        },

        verificationSessions: {
          create: {
            tokenHash,
            expiresAt,
            // status defaults to PENDING via schema
          },
        },
      },
      include: {
        verificationSessions: {
          select: { id: true, status: true, expiresAt: true },
        },
      },
    });

    const session = sale.verificationSessions[0];
    const verificationUrl = `${APP_URL}/v/${token}`;

    // Queue notification logging — fire-and-forget; must never break core flow.
    sendVerificationLinkNotification({
      saleId: sale.id,
      customerPhone: sale.customerPhone ?? null,
      customerEmail: sale.customerEmail ?? null,
      verificationUrl,
      clientWebhookUrl: client.webhookUrl ?? null,
      webhookSecret: client.webhookSecret ?? null,
    }).catch((err) =>
      console.error("[intake] notification logging error:", err)
    );

    // Return the raw token in the URL — it is never stored.
    return NextResponse.json(
      {
        ok: true,
        sale_id: sale.id,
        verification_session_id: session.id,
        verification_url: verificationUrl,
        status: session.status,
        expires_at: session.expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    // Log the error server-side only — never expose internal details.
    console.error("[sales/intake] database error:", err);
    return errors.internal();
  }
}

async function resolveSubmittedByUserId({
  sellerEmail,
  organizationId,
}: {
  sellerEmail?: string;
  organizationId: string | null;
}): Promise<string | null> {
  if (!sellerEmail) {
    return null;
  }

  if (!organizationId) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: sellerEmail },
    select: {
      id: true,
      memberships: {
        where: { organizationId },
        select: { role: true },
        take: 1,
      },
    },
  });

  const membership = user?.memberships[0];
  if (!user || !membership) {
    return null;
  }

  if (!(SALE_OWNER_ROLES as readonly Role[]).includes(membership.role)) {
    return null;
  }

  return user.id;
}

