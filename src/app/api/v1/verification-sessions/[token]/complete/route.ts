// Phase 4 — POST /api/v1/verification-sessions/[token]/complete
// Validates customer consent, records audit events, marks session COMPLETED,
// updates the sale to VERIFIED, and creates the immutable Certificate.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { errors } from "@/lib/errors";
import { completeVerificationSchema } from "@/lib/validation";
import { checkCompletionGuards, completeVerificationSession } from "@/lib/verification-completion";
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
              id: true,
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
  // 4. Status guards — must run before the name-match check below, to
  //    preserve the original guards-then-validate ordering exactly
  // ------------------------------------------------------------------
  const guardFailure = await checkCompletionGuards(session, completedAt);
  if (guardFailure) {
    if (guardFailure.reason === "ALREADY_COMPLETED") {
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
    if (guardFailure.reason === "ALREADY_DECLINED") {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "CONFLICT", message: "Verification was declined" },
        },
        { status: 409 }
      );
    }
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
  // 6. Certificate + consent-event transaction (shared with the phone-call
  //    completion path). Guards were already checked above, but
  //    completeVerificationSession re-checks them defensively (cheap,
  //    idempotent) in case anything changed between the two calls.
  // ------------------------------------------------------------------
  let result;
  try {
    result = await completeVerificationSession({
      session,
      sale,
      evidence: {
        method: "web",
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
        confirm_details_correct: data.confirm_details_correct,
        confirm_product_price_frequency: data.confirm_product_price_frequency,
      },
    });
  } catch (err) {
    console.error("[complete] transaction failed:", err);
    return errors.internal();
  }

  if (!result.ok) {
    if (result.reason === "ALREADY_COMPLETED") {
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
    if (result.reason === "ALREADY_DECLINED") {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "CONFLICT", message: "Verification was declined" },
        },
        { status: 409 }
      );
    }
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

  const cert = { id: result.certificateId };

  // ------------------------------------------------------------------
  // 7. Fire notification logs — non-blocking; must not break core flow
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
  // 8. Return success — never include tokenHash or encryptedAccountNumber
  // ------------------------------------------------------------------
  return NextResponse.json(
    {
      ok: true,
      status: "COMPLETED",
      verification_session_id: session.id,
      sale_id: sale.id,
      certificate_id: cert.id,
      completed_at: result.completedAt.toISOString(),
      message: "Verification completed successfully",
    },
    { status: 200 }
  );
}
