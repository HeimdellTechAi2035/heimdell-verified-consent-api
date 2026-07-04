// Shared verification-decline logic, used by both the web /decline route
// and the phone-call DTMF "2" (gather) webhook. Preserves the exact
// 3-outcome semantics of the original web-only route: idempotent success on
// an already-declined session, conflict on an already-completed one,
// expired-flip past the deadline.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type DeclineVerificationSessionParams = {
  session: { id: string; saleId: string; status: string; expiresAt: Date; declinedAt: Date | null };
  reason: string;
  details?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Extra context merged into the VERIFICATION_DECLINED event payload, e.g. { via: "phone_call", call_sid }. */
  metadata?: Record<string, unknown>;
};

export type DeclineVerificationSessionResult =
  | { ok: true; alreadyDeclined: boolean; declinedAt: Date }
  | { ok: false; reason: "ALREADY_COMPLETED" | "EXPIRED" };

export async function declineVerificationSession(
  params: DeclineVerificationSessionParams
): Promise<DeclineVerificationSessionResult> {
  const { session, reason, details, ipAddress, userAgent, metadata } = params;
  const declinedAt = new Date();

  if (session.status === "COMPLETED") {
    return { ok: false, reason: "ALREADY_COMPLETED" };
  }

  if (session.status === "DECLINED") {
    return { ok: true, alreadyDeclined: true, declinedAt: session.declinedAt ?? declinedAt };
  }

  if (session.expiresAt < declinedAt) {
    await db.verificationSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    return { ok: false, reason: "EXPIRED" };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.consentEvent.create({
        data: {
          verificationSessionId: session.id,
          eventType: "VERIFICATION_DECLINED",
          eventPayload: {
            reason,
            details: details ?? null,
            ...metadata,
          } as unknown as Prisma.InputJsonValue,
          ipAddress,
          userAgent,
        },
      });

      await tx.verificationSession.update({
        where: { id: session.id },
        data: { status: "DECLINED", declinedAt },
      });

      await tx.sale.update({
        where: { id: session.saleId },
        data: { status: "DECLINED" },
      });
    });

    return { ok: true, alreadyDeclined: false, declinedAt };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // A concurrent completion could have flipped status just before this
      // transaction started -- surface it as a conflict rather than a 500.
      const current = await db.verificationSession.findUnique({
        where: { id: session.id },
        select: { status: true },
      });
      if (current?.status === "COMPLETED") {
        return { ok: false, reason: "ALREADY_COMPLETED" };
      }
    }
    throw err;
  }
}
