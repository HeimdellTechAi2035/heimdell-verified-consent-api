import type { Client, DirectDebitMandate, Sale, VerificationSession } from "@prisma/client";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { resolveSalePolicySnapshot, type CompliancePolicySnapshot } from "@/lib/client-policy";
import type { SafeMandate } from "@/lib/certificate";

export type CallSession = {
  token: string;
  verificationSession: VerificationSession;
  sale: Sale & { client: Client; directDebitMandate: SafeMandate | null };
  policySnapshot: CompliancePolicySnapshot;
};

export type BootstrapFailureReason = "NOT_FOUND" | "ALREADY_COMPLETED" | "ALREADY_DECLINED" | "EXPIRED";

export type BootstrapResult =
  | { ok: true; session: CallSession }
  | { ok: false; reason: BootstrapFailureReason };

const SAFE_MANDATE_SELECT = {
  id: true,
  bankName: true,
  sortCode: true,
  accountNumberLast4: true,
  accountHolderName: true,
} as const;

/**
 * Mirrors src/lib/session-lookup.ts's guard order (not-found -> completed ->
 * declined -> expired) but returns the raw Prisma objects rather than a
 * flattened DTO, since completeVerificationSession()/declineVerificationSession()
 * need the actual VerificationSession/Sale shapes, not a display projection.
 * Does not mark the session OPENED -- completeVerificationSession's own
 * checkCompletionGuards() re-validates status/expiry at completion time
 * regardless, so there's no correctness need to write status here too.
 *
 * Deliberately does NOT look up VerificationSession.tokenHash directly --
 * that's the same secret handed to the customer for the web verification
 * page. This looks up a separate, one-time PhoneVerificationAttempt.wsTokenHash
 * instead, minted only inside the Twilio-signature-verified /twiml route
 * (see src/app/api/v1/voice/verification/[token]/twiml/route.ts), so a
 * leaked web link alone can never open a WS connection here.
 */
export async function bootstrapCallSession(rawToken: string): Promise<BootstrapResult> {
  const wsTokenHash = hashToken(rawToken);

  const attempt = await db.phoneVerificationAttempt.findUnique({
    where: { wsTokenHash },
    include: {
      verificationSession: {
        include: {
          sale: {
            include: {
              client: true,
              directDebitMandate: { select: SAFE_MANDATE_SELECT },
            },
          },
        },
      },
    },
  });

  if (!attempt || !attempt.wsTokenExpiresAt || attempt.wsTokenExpiresAt < new Date()) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const verificationSession = attempt.verificationSession;

  if (verificationSession.status === "COMPLETED") {
    return { ok: false, reason: "ALREADY_COMPLETED" };
  }

  if (verificationSession.status === "DECLINED") {
    return { ok: false, reason: "ALREADY_DECLINED" };
  }

  if (verificationSession.expiresAt < new Date()) {
    return { ok: false, reason: "EXPIRED" };
  }

  const { sale, ...sessionOnly } = verificationSession;

  const policySnapshot = resolveSalePolicySnapshot({
    policySnapshot: sale.policySnapshot,
    productTerms: sale.productTerms,
    productPolicies: sale.productPolicies,
    coolingOffDays: sale.coolingOffDays,
  });

  return {
    ok: true,
    session: {
      token: rawToken,
      verificationSession: sessionOnly,
      sale,
      policySnapshot,
    },
  };
}
