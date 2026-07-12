import type { ConsentEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Writes one ConsentEvent live, as each state's confirmation actually
 * happens during the call -- this is the real compliance upgrade over the
 * legacy DTMF flow's single bundled keypress, and means a call that drops
 * mid-conversation still leaves a genuine partial audit trail.
 */
export async function recordLiveConsentEvent(
  verificationSessionId: string,
  eventType: ConsentEventType,
  payload: Record<string, unknown>
): Promise<void> {
  await db.consentEvent.create({
    data: {
      verificationSessionId,
      eventType,
      eventPayload: payload as unknown as Prisma.InputJsonValue,
    },
  });
}
