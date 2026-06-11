// Phase 1 foundations — consent event / audit log helper placeholder
// Phase 2 will wire this into every meaningful step of the verification flow.

import { db } from "@/lib/db";
import type { ConsentEventType, Prisma } from "@prisma/client";

export type ConsentEventInput = {
  verificationSessionId: string;
  eventType: ConsentEventType;
  eventPayload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * PLACEHOLDER — Persist a consent event to the immutable audit log.
 *
 * Phase 2 will add:
 *   - Retry logic for transient DB failures
 *   - Structured error reporting
 *   - Integration into the verification session state machine
 */
export async function createConsentEvent(
  input: ConsentEventInput
): Promise<void> {
  // TODO: add retry/error handling in Phase 2
  await db.consentEvent.create({
    data: {
      verificationSessionId: input.verificationSessionId,
      eventType: input.eventType,
      eventPayload: (input.eventPayload ?? {}) as Prisma.InputJsonValue,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
