// Phase 3 — GET /api/v1/verification-sessions/:token
// Returns safe, customer-facing session data for the verification page.

import { type NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/crypto";
import { lookupVerificationSession } from "@/lib/session-lookup";
import { errors } from "@/lib/errors";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenFingerprint = safeFingerprint(hashToken(token), 16);

  const limited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.publicTokenLookup,
    route: "GET /api/v1/verification-sessions/[token]",
    identifiers: [tokenFingerprint],
  });
  if (limited) return limited;

  let result: Awaited<ReturnType<typeof lookupVerificationSession>>;
  try {
    result = await lookupVerificationSession(token);
  } catch (err) {
    console.error("[verification-sessions] lookup failed:", err);
    return errors.internal();
  }

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      const invalidLimited = await enforceRateLimit({
        req,
        policy: RATE_LIMIT_POLICIES.invalidTokenAttempt,
        route: "GET /api/v1/verification-sessions/[token]:invalid",
        identifiers: [tokenFingerprint],
      });
      if (invalidLimited) return invalidLimited;
    }

    switch (result.reason) {
      case "NOT_FOUND":
        return errors.notFound("Verification session not found");

      case "EXPIRED":
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

      case "COMPLETED":
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

      case "DECLINED":
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "CONFLICT",
              message: "Verification was declined",
            },
          },
          { status: 409 }
        );
    }
  }

  return NextResponse.json({ ok: true, ...result.data });
}
