// Phase 4 — POST /api/v1/verification-sessions/[token]/complete
// Validates customer consent, records audit events, marks session COMPLETED,
// updates the sale to VERIFIED, and creates the immutable Certificate.

import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { errors } from "@/lib/errors";
import { completeVerificationSchema } from "@/lib/validation";
import { createCertificateJson } from "@/lib/certificate";
import {
  sendVerificationCompletedNotification,
  sendCertificateCreatedNotification,
} from "@/lib/notifications";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Name matching — case-insensitive, whitespace-normalised
// ---------------------------------------------------------------------------

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  // Never log the raw token.
  const tokenFingerprint = safeFingerprint(hashToken(token), 16);

  const limited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.publicTokenSubmit,
    route: "POST /api/v1/verification-sessions/[token]/complete",
    identifiers: [tokenFingerprint],
  });
  if (limited) return limited;

  // ------------------------------------------------------------------
  // 1. Parse and validate request body
  // ------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errors.badRequest("Request body must be valid JSON");
  }

  const parsed = completeVerificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errors.badRequest("Invalid request payload", parsed.error.flatten());
  }
  const data = parsed.data;

  // ------------------------------------------------------------------
  // 2. Capture evidence headers
  // ------------------------------------------------------------------
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const completedAt = new Date();

  // ------------------------------------------------------------------
  // 3. Look up session (hash token — never compare raw)
  // ------------------------------------------------------------------
  const tokenHash = hashToken(token);

  const session = await db.verificationSession.findUnique({
    where: { tokenHash },
    include: {
      sale: {
        include: {
          client: true,
          directDebitMandate: {
            // Select only safe fields — encryptedAccountNumber is intentionally excluded.
            select: {
              bankName: true,
              sortCode: true,
              accountNumberLast4: true,
              accountHolderName: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    const invalidLimited = await enforceRateLimit({
      req,
      policy: RATE_LIMIT_POLICIES.invalidTokenAttempt,
      route: "POST /api/v1/verification-sessions/[token]/complete:invalid",
      identifiers: [tokenFingerprint],
    });
    if (invalidLimited) return invalidLimited;
    return errors.notFound("Verification session not found");
  }

  // ------------------------------------------------------------------
  // 4. Status guards — idempotency-safe
  // ------------------------------------------------------------------
  if (session.status === "COMPLETED") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "Verification has already been completed",
        },
      },
      { status: 409 }
    );
  }

  if (session.status === "DECLINED") {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "CONFLICT", message: "Verification was declined" },
      },
      { status: 409 }
    );
  }

  if (session.expiresAt < completedAt) {
    await db.verificationSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "GONE",
          message: "This verification link has expired",
        },
      },
      { status: 410 }
    );
  }

  // ------------------------------------------------------------------
  // 5. Validate typed name against customer name on record
  // ------------------------------------------------------------------
  const { sale } = session;

  if (normaliseName(data.typed_name) !== normaliseName(sale.customerName)) {
    return errors.badRequest(
      `The name you typed does not match the name on record. ` +
        `Please type your full name exactly as it appears: "${sale.customerName}".`
    );
  }

  // ------------------------------------------------------------------
  // 6. Build certificate payload (outside transaction — pure computation)
  // ------------------------------------------------------------------
  const { payload: certPayload, proofHash } = createCertificateJson({
    session,
    sale,
    evidence: {
      typed_name: data.typed_name,
      ip_address: ipAddress,
      user_agent: userAgent,
      completed_at: completedAt,
      terms_acknowledged: data.confirm_terms,
      policies_acknowledged: data.confirm_policies,
      cooling_off_acknowledged: data.confirm_cooling_off,
      direct_debit_authorised: data.authorise_direct_debit,
      evidence_storage_acknowledged: data.confirm_evidence_storage,
      ai_consent_confirmed: data.confirm_ai_consent ?? false,
    },
  });

  // ------------------------------------------------------------------
  // 7. Atomic transaction: events → session → sale → certificate
  //    Certificate.verificationSessionId is @unique, so a second
  //    concurrent completion will fail with P2002 (unique constraint).
  // ------------------------------------------------------------------
  let cert: { id: string };

  try {
    const result = await db.$transaction(async (tx) => {
      // Consent audit events
      await tx.consentEvent.createMany({
        data: [
          {
            verificationSessionId: session.id,
            eventType: "TERMS_ACKNOWLEDGED",
            eventPayload: {
              confirm_terms: true,
              confirm_details_correct: data.confirm_details_correct,
              confirm_product_price_frequency:
                data.confirm_product_price_frequency,
            } as unknown as Prisma.InputJsonValue,
            ipAddress,
            userAgent,
          },
          {
            verificationSessionId: session.id,
            eventType: "POLICIES_ACKNOWLEDGED",
            eventPayload: {
              confirm_policies: true,
            } as unknown as Prisma.InputJsonValue,
            ipAddress,
            userAgent,
          },
          {
            verificationSessionId: session.id,
            eventType: "COOLING_OFF_ACKNOWLEDGED",
            eventPayload: {
              confirm_cooling_off: true,
            } as unknown as Prisma.InputJsonValue,
            ipAddress,
            userAgent,
          },
          {
            verificationSessionId: session.id,
            eventType: "DIRECT_DEBIT_AUTHORISED",
            eventPayload: {
              authorise_direct_debit: true,
            } as unknown as Prisma.InputJsonValue,
            ipAddress,
            userAgent,
          },
          {
            verificationSessionId: session.id,
            eventType: "VERIFICATION_COMPLETED",
            eventPayload: {
              typed_name: data.typed_name,
              completed_at: completedAt.toISOString(),
              confirm_evidence_storage: data.confirm_evidence_storage,
            } as unknown as Prisma.InputJsonValue,
            ipAddress,
            userAgent,
          },
        ],
      });

      // Mark session complete
      await tx.verificationSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED", completedAt },
      });

      // Mark sale verified
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "VERIFIED" },
      });

      // Create immutable certificate
      const certificate = await tx.certificate.create({
        data: {
          verificationSessionId: session.id,
          certificateJson: {
            ...certPayload,
            proof_hash: proofHash,
          } as unknown as Prisma.InputJsonValue,
          proofHash,
        },
        select: { id: true },
      });

      return certificate;
    });

    cert = result;
  } catch (err) {
    // P2002 = unique constraint — certificate already created (race condition)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CONFLICT",
            message: "Verification has already been completed",
          },
        },
        { status: 409 }
      );
    }
    console.error("[complete] transaction failed:", err);
    return errors.internal();
  }

  // ------------------------------------------------------------------
  // 8. Fire notification logs — non-blocking; must not break core flow
  // ------------------------------------------------------------------
  const notifyParams = {
    saleId: sale.id,
    verificationSessionId: session.id,
    customerPhone: sale.customerPhone ?? null,
    customerEmail: sale.customerEmail ?? null,
    clientWebhookUrl: sale.client.webhookUrl ?? null,
    webhookSecret: sale.client.webhookSecret ?? null,
  };
  sendVerificationCompletedNotification(notifyParams).catch((err) =>
    console.error("[complete] completed notification error:", err)
  );
  sendCertificateCreatedNotification({
    saleId: sale.id,
    certificateId: cert.id,
    clientWebhookUrl: sale.client.webhookUrl ?? null,
    webhookSecret: sale.client.webhookSecret ?? null,
  }).catch((err) =>
    console.error("[complete] certificate notification error:", err)
  );

  // ------------------------------------------------------------------
  // 9. Return success — never include tokenHash or encryptedAccountNumber
  // ------------------------------------------------------------------
  return NextResponse.json(
    {
      ok: true,
      status: "COMPLETED",
      verification_session_id: session.id,
      sale_id: sale.id,
      certificate_id: cert.id,
      completed_at: completedAt.toISOString(),
      message: "Verification completed successfully",
    },
    { status: 200 }
  );
}
