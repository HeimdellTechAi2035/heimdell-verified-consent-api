// Phase 5 — POST /api/v1/verification-sessions/[token]/decline
// Records a customer decline, marks the session DECLINED, and marks the sale DECLINED.
// A declined session can never be subsequently completed.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { errors } from "@/lib/errors";
import { declineVerificationSchema } from "@/lib/validation";
import { declineVerificationSession } from "@/lib/verification-decline";
import { sendVerificationDeclinedNotification } from "@/lib/notifications";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

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
    route: "POST /api/v1/verification-sessions/[token]/decline",
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

  const parsed = declineVerificationSchema.safeParse(rawBody);
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

  // ------------------------------------------------------------------
  // 3. Look up session by hashed token
  // ------------------------------------------------------------------
  const tokenHash = hashToken(token);

  const session = await db.verificationSession.findUnique({
    where: { tokenHash },
    include: {
      sale: {
        select: {
          id: true,
          clientId: true,
          customerPhone: true,
          customerEmail: true,
          client: {
            select: { webhookUrl: true, webhookSecret: true },
          },
        },
      },
    },
  });

  if (!session) {
    const invalidLimited = await enforceRateLimit({
      req,
      policy: RATE_LIMIT_POLICIES.invalidTokenAttempt,
      route: "POST /api/v1/verification-sessions/[token]/decline:invalid",
      identifiers: [tokenFingerprint],
    });
    if (invalidLimited) return invalidLimited;
    return errors.notFound("Verification session not found");
  }

  // ------------------------------------------------------------------
  // 4. Guards + audit event + session/sale update (shared with the
  //    phone-call decline path)
  // ------------------------------------------------------------------
  let result;
  try {
    result = await declineVerificationSession({
      session: {
        id: session.id,
        saleId: session.sale.id,
        status: session.status,
        expiresAt: session.expiresAt,
        declinedAt: session.declinedAt,
      },
      reason: data.reason,
      details: data.details,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.error("[decline] transaction failed:", err);
    return errors.internal();
  }

  if (!result.ok) {
    if (result.reason === "ALREADY_COMPLETED") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CONFLICT",
            message: "Verification has already been completed and cannot be declined",
          },
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

  // Idempotent: already declined — return a safe already-declined response
  if (result.alreadyDeclined) {
    return NextResponse.json(
      {
        ok: true,
        status: "DECLINED",
        verification_session_id: session.id,
        sale_id: session.sale.id,
        declined_at: result.declinedAt.toISOString(),
        message: "Verification was already declined",
      },
      { status: 200 }
    );
  }

  // ------------------------------------------------------------------
  // 5. Fire notification logs — non-blocking; must not break core flow
  // ------------------------------------------------------------------
  sendVerificationDeclinedNotification({
    saleId: session.sale.id,
    verificationSessionId: session.id,
    customerPhone: session.sale.customerPhone ?? null,
    customerEmail: session.sale.customerEmail ?? null,
    clientWebhookUrl: session.sale.client.webhookUrl ?? null,
    webhookSecret: session.sale.client.webhookSecret ?? null,
  }).catch((err) =>
    console.error("[decline] notification logging error:", err)
  );

  // ------------------------------------------------------------------
  // 6. Return success — no certificate is created for declined sessions
  // ------------------------------------------------------------------
  return NextResponse.json(
    {
      ok: true,
      status: "DECLINED",
      verification_session_id: session.id,
      sale_id: session.sale.id,
      declined_at: result.declinedAt.toISOString(),
      message: "Verification declined",
    },
    { status: 200 }
  );
}
