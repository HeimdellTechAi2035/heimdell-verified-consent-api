import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CallSession } from "./session/session-bootstrap";
import type { ConversationStateId } from "./states/types";

// Fields the customer can correct live during a call. accountNumberLast4 is
// flag-only -- never auto-applied. The agent only ever has the last two
// digits (see definitions.ts), and auto-writing a full account number from
// phone speech-to-text with no human check would be a real fraud/data-
// integrity risk this product exists to prevent, not create, so a disputed
// account number is always routed to DD_MISMATCH_FOLLOWUP for manual
// follow-up instead of being auto-corrected here.
export type CorrectableField =
  | "customerName"
  | "customerAddress"
  | "customerEmail"
  | "productName"
  | "productFrequency"
  | "productPrice"
  | "bankName"
  | "sortCode"
  | "accountNumberLast4";

const SALE_FIELDS: ReadonlySet<CorrectableField> = new Set([
  "customerName",
  "customerAddress",
  "customerEmail",
  "productName",
  "productFrequency",
  "productPrice",
]);

const MANDATE_FIELDS: ReadonlySet<CorrectableField> = new Set(["bankName", "sortCode"]);
// Deliberately not auto-applied -- see the CorrectableField comment above.
const FLAG_ONLY_FIELDS: ReadonlySet<CorrectableField> = new Set(["accountNumberLast4"]);

type ReviewFlagEntry = {
  field: CorrectableField;
  state: ConversationStateId;
  oldValue: string;
  newValue: string;
  applied: boolean;
  correctedAt: string;
};

/**
 * Normalises and sanity-checks a spoken correction before it's allowed to
 * overwrite a live record. Anything that doesn't pass is still recorded
 * (captureCorrection always flags for review) but never written to
 * Sale/DirectDebitMandate -- a malformed value is worse than no auto-apply.
 */
function validateNewValue(field: CorrectableField, rawValue: string): { ok: true; value: string } | { ok: false } {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { ok: false };
  }

  if (field === "sortCode") {
    const digits = trimmed.replace(/\D/g, "");
    return /^\d{6}$/.test(digits) ? { ok: true, value: digits } : { ok: false };
  }

  if (field === "productPrice") {
    return /^\d+(\.\d{1,2})?$/.test(trimmed) ? { ok: true, value: trimmed } : { ok: false };
  }

  if (field === "customerEmail") {
    const normalized = trimmed.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? { ok: true, value: normalized } : { ok: false };
  }

  return { ok: true, value: trimmed };
}

export type CaptureCorrectionParams = {
  saleId: string;
  directDebitMandateId: string | null;
  verificationSessionId: string;
  state: ConversationStateId;
  field: CorrectableField;
  oldValue: string;
  rawNewValue: string;
};

/**
 * Writes a customer-stated correction back to the live Sale/
 * DirectDebitMandate record when it validates cleanly, and ALWAYS flags the
 * sale for review (needsReview + an appended reviewFlags entry) and writes
 * a DATA_CORRECTED_ON_CALL ConsentEvent -- even when the value didn't
 * validate and nothing was auto-applied, so staff still find out something
 * was reported wrong rather than it silently vanishing into the call
 * transcript.
 */
export async function captureCorrection(params: CaptureCorrectionParams): Promise<void> {
  const { saleId, directDebitMandateId, verificationSessionId, state, field, oldValue, rawNewValue } = params;
  const validated = !FLAG_ONLY_FIELDS.has(field) ? validateNewValue(field, rawNewValue) : ({ ok: false } as const);
  const applied =
    validated.ok && (SALE_FIELDS.has(field) || (MANDATE_FIELDS.has(field) && Boolean(directDebitMandateId)));

  if (applied && validated.ok) {
    try {
      // Deliberately not a dynamic `{ [field]: value }` write -- Prisma's
      // generated update-input types don't reject a computed key from a
      // wider string-literal union at compile time (verified: TS lets
      // `{ [field]: value }` through even for a key that isn't a real
      // column), so an explicit switch is the only thing that actually
      // guarantees each write only ever targets a real column.
      switch (field) {
        case "customerName":
          await db.sale.update({ where: { id: saleId }, data: { customerName: validated.value } });
          break;
        case "customerAddress":
          await db.sale.update({ where: { id: saleId }, data: { customerAddress: validated.value } });
          break;
        case "customerEmail":
          await db.sale.update({ where: { id: saleId }, data: { customerEmail: validated.value } });
          break;
        case "productName":
          await db.sale.update({ where: { id: saleId }, data: { productName: validated.value } });
          break;
        case "productFrequency":
          await db.sale.update({ where: { id: saleId }, data: { productFrequency: validated.value } });
          break;
        case "productPrice":
          await db.sale.update({ where: { id: saleId }, data: { productPrice: validated.value } });
          break;
        case "bankName":
          if (directDebitMandateId) {
            await db.directDebitMandate.update({
              where: { id: directDebitMandateId },
              data: { bankName: validated.value },
            });
          }
          break;
        case "sortCode":
          if (directDebitMandateId) {
            await db.directDebitMandate.update({
              where: { id: directDebitMandateId },
              data: { sortCode: validated.value },
            });
          }
          break;
        case "accountNumberLast4":
          // Flag-only -- never reaches here (FLAG_ONLY_FIELDS forces
          // validated.ok to false), but listed for switch exhaustiveness.
          break;
      }
    } catch (err) {
      console.error(`[voice-agent] failed to apply correction for ${field} on sale ${saleId}:`, err);
    }
  }

  const entry: ReviewFlagEntry = {
    field,
    state,
    oldValue,
    newValue: validated.ok ? validated.value : rawNewValue,
    applied: Boolean(applied),
    correctedAt: new Date().toISOString(),
  };

  try {
    const current = await db.sale.findUniqueOrThrow({ where: { id: saleId }, select: { reviewFlags: true } });
    const existingFlags = Array.isArray(current.reviewFlags) ? current.reviewFlags : [];
    await db.sale.update({
      where: { id: saleId },
      data: {
        needsReview: true,
        reviewFlags: [...existingFlags, entry] as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[voice-agent] failed to record reviewFlags for sale ${saleId}:`, err);
  }

  try {
    await db.consentEvent.create({
      data: {
        verificationSessionId,
        eventType: "DATA_CORRECTED_ON_CALL",
        eventPayload: entry as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[voice-agent] failed to record DATA_CORRECTED_ON_CALL event for sale ${saleId}:`, err);
  }
}

const CORRECTABLE_FIELDS: ReadonlySet<CorrectableField> = new Set([
  "customerName",
  "customerAddress",
  "customerEmail",
  "productName",
  "productFrequency",
  "productPrice",
  "bankName",
  "sortCode",
  "accountNumberLast4",
]);

function isCorrectableField(value: unknown): value is CorrectableField {
  return typeof value === "string" && CORRECTABLE_FIELDS.has(value as CorrectableField);
}

/** Claude's captured_data contract for this feature: { corrections: [{ field, value }] }. Anything malformed is silently dropped rather than thrown -- a prompt-following slip must never crash the call. */
function extractCorrections(
  capturedData: Record<string, unknown> | undefined
): Array<{ field: CorrectableField; value: string }> {
  if (!capturedData || !Array.isArray(capturedData.corrections)) {
    return [];
  }

  const result: Array<{ field: CorrectableField; value: string }> = [];
  for (const item of capturedData.corrections) {
    if (
      item &&
      typeof item === "object" &&
      isCorrectableField((item as Record<string, unknown>).field) &&
      typeof (item as Record<string, unknown>).value === "string"
    ) {
      result.push({
        field: (item as Record<string, unknown>).field as CorrectableField,
        value: (item as Record<string, unknown>).value as string,
      });
    }
  }
  return result;
}

function resolveOldValue(sale: CallSession["sale"], field: CorrectableField): string {
  switch (field) {
    case "customerName":
      return sale.customerName;
    case "customerAddress":
      return sale.customerAddress ?? "";
    case "customerEmail":
      return sale.customerEmail ?? "";
    case "productName":
      return sale.productName;
    case "productFrequency":
      return sale.productFrequency ?? "";
    case "productPrice":
      return sale.productPrice.toString();
    case "bankName":
      return sale.directDebitMandate?.bankName ?? "";
    case "sortCode":
      return sale.directDebitMandate?.sortCode ?? "";
    case "accountNumberLast4":
      return sale.directDebitMandate?.accountNumberLast4 ?? "";
  }
}

/**
 * Reads any { corrections: [...] } out of a turn's captured_data and
 * applies each one, regardless of whether that turn was a self-transition
 * (e.g. mid-way through the Direct Debit 3-step confirmation) or a genuine
 * state advance -- corrections must be captured on the turn they're
 * confirmed on, not just on turns that also happen to record a
 * ConsentEvent.
 */
export async function applyCapturedCorrections(
  callSession: CallSession,
  state: ConversationStateId,
  capturedData: Record<string, unknown> | undefined
): Promise<void> {
  const corrections = extractCorrections(capturedData);
  if (corrections.length === 0) {
    return;
  }

  for (const correction of corrections) {
    await captureCorrection({
      saleId: callSession.sale.id,
      directDebitMandateId: callSession.sale.directDebitMandate?.id ?? null,
      verificationSessionId: callSession.verificationSession.id,
      state,
      field: correction.field,
      oldValue: resolveOldValue(callSession.sale, correction.field),
      rawNewValue: correction.value,
    });
  }
}
