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

// Free-text fields (name/address/product name/bank name) had no length
// bound at all -- voice STT can produce long, garbled runs of text (e.g.
// a customer rambling, or a misfire that transcribes background noise),
// and that would previously get validated as "ok" and written straight to
// the DB, then flow unbounded into the certificate, its PDF render, and
// the plain-text completion email. Generous enough for any real name/
// address/product/bank name, not for a STT misfire.
const MAX_FREE_TEXT_LENGTH = 200;

// reviewFlags is a JSON array with no cap -- a confused turn re-stating
// the same field repeatedly (the 3-step Direct Debit confirmation alone
// applies corrections on self-transitions, not just real state changes)
// or corrections across many calls to the same sale could grow this
// unbounded. Keep only the most recent entries; older ones are still in
// the DATA_CORRECTED_ON_CALL ConsentEvent audit trail, which is
// append-only and never trimmed.
const MAX_REVIEW_FLAGS = 50;

export type ReviewFlagEntry = {
  field: CorrectableField | "unknown";
  state: ConversationStateId;
  oldValue: string;
  newValue: string;
  applied: boolean;
  correctedAt: string;
};

/** Shared by captureCorrection, flagMalformedCorrectionAttempt, and (imported directly) terminal-outcomes.ts/ws-handler.ts for technical-failure/disconnect visibility -- appends one entry, capped at MAX_REVIEW_FLAGS (oldest dropped first; the full history stays in the append-only DATA_CORRECTED_ON_CALL ConsentEvent log). */
export async function appendReviewFlag(saleId: string, entry: ReviewFlagEntry): Promise<void> {
  try {
    const current = await db.sale.findUniqueOrThrow({ where: { id: saleId }, select: { reviewFlags: true } });
    const existingFlags = Array.isArray(current.reviewFlags) ? current.reviewFlags : [];
    const updatedFlags = [...existingFlags, entry].slice(-MAX_REVIEW_FLAGS);
    await db.sale.update({
      where: { id: saleId },
      data: { needsReview: true, reviewFlags: updatedFlags as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error(`[voice-agent] failed to record reviewFlags for sale ${saleId}:`, err);
  }
}

/**
 * Normalises and sanity-checks a spoken correction before it's allowed to
 * overwrite a live record. Anything that doesn't pass is still recorded
 * (captureCorrection always flags for review) but never written to
 * Sale/DirectDebitMandate -- a malformed value is worse than no auto-apply.
 */
function validateNewValue(field: CorrectableField, rawValue: string): { ok: true; value: string } | { ok: false } {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.length > MAX_FREE_TEXT_LENGTH) {
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

  await appendReviewFlag(saleId, entry);

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

type ExtractedCorrections = {
  valid: Array<{ field: CorrectableField; value: string }>;
  /** True if at least one entry didn't match the {field, value} shape (unknown/misspelled field, non-string value, etc). */
  hadMalformedEntries: boolean;
};

/**
 * Claude's captured_data contract for this feature: { corrections:
 * [{ field, value }] }. A malformed entry (unknown field, non-string
 * value, wrong shape) must never crash the call -- but silently dropping
 * it with zero trace, as this used to, defeats the "always flag it, even
 * if it didn't validate" guarantee the rest of this file makes: a
 * customer's stated correction could vanish with no record anywhere, not
 * even a log line. Now every dropped entry is logged, and the caller
 * flags the sale for review if anything was dropped.
 */
function extractCorrections(
  capturedData: Record<string, unknown> | undefined,
  context: { state: ConversationStateId; saleId: string }
): ExtractedCorrections {
  if (!capturedData || !Array.isArray(capturedData.corrections)) {
    return { valid: [], hadMalformedEntries: false };
  }

  const valid: Array<{ field: CorrectableField; value: string }> = [];
  let hadMalformedEntries = false;

  for (const item of capturedData.corrections) {
    if (
      item &&
      typeof item === "object" &&
      isCorrectableField((item as Record<string, unknown>).field) &&
      typeof (item as Record<string, unknown>).value === "string"
    ) {
      valid.push({
        field: (item as Record<string, unknown>).field as CorrectableField,
        value: (item as Record<string, unknown>).value as string,
      });
    } else {
      hadMalformedEntries = true;
      console.error(
        `[voice-agent] dropped malformed correction in state ${context.state} for sale ${context.saleId}:`,
        JSON.stringify(item)
      );
    }
  }

  return { valid, hadMalformedEntries };
}

type CurrentSaleValues = {
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  productName: string;
  productFrequency: string | null;
  productPrice: { toString(): string };
  directDebitMandate: { bankName: string; sortCode: string; accountNumberLast4: string } | null;
};

/**
 * Reads the sale/mandate values directly from the DB at the moment of
 * correction, rather than from callSession.sale (a snapshot taken once at
 * call bootstrap that's never refreshed). Without this, correcting the
 * same field twice in one call recorded the WRONG "old value" for the
 * second correction (the original pre-call value instead of the value
 * after the first correction), making the audit trail itself inaccurate.
 */
async function fetchCurrentSaleValues(saleId: string): Promise<CurrentSaleValues> {
  return db.sale.findUniqueOrThrow({
    where: { id: saleId },
    select: {
      customerName: true,
      customerAddress: true,
      customerEmail: true,
      productName: true,
      productFrequency: true,
      productPrice: true,
      directDebitMandate: {
        select: { bankName: true, sortCode: true, accountNumberLast4: true },
      },
    },
  });
}

function resolveOldValue(sale: CurrentSaleValues, field: CorrectableField): string {
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
 * A malformed captured_data entry can't be shoehorned into a
 * CorrectableField-typed reviewFlags entry (we don't reliably know what
 * field Claude meant), but staff still need SOME signal that a correction
 * attempt happened and was lost -- rather than it only existing as a log
 * line nobody is watching. This is deliberately generic/catch-all.
 */
async function flagMalformedCorrectionAttempt(
  saleId: string,
  verificationSessionId: string,
  state: ConversationStateId
): Promise<void> {
  const note: ReviewFlagEntry = {
    field: "unknown",
    state,
    oldValue: "",
    newValue: "(malformed captured_data -- see server logs for the raw call)",
    applied: false,
    correctedAt: new Date().toISOString(),
  };

  await appendReviewFlag(saleId, note);

  try {
    await db.consentEvent.create({
      data: {
        verificationSessionId,
        eventType: "DATA_CORRECTED_ON_CALL",
        eventPayload: note as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[voice-agent] failed to record malformed-correction event for sale ${saleId}:`, err);
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
  const { valid: corrections, hadMalformedEntries } = extractCorrections(capturedData, {
    state,
    saleId: callSession.sale.id,
  });

  if (hadMalformedEntries) {
    await flagMalformedCorrectionAttempt(callSession.sale.id, callSession.verificationSession.id, state);
  }

  if (corrections.length === 0) {
    return;
  }

  for (const correction of corrections) {
    // Fetched fresh on every iteration (not hoisted above the loop) so a
    // turn correcting the same field twice -- unusual, but the state
    // prompts don't forbid it -- still records an accurate "old value"
    // for the second entry too, reflecting the first correction's write.
    const currentSale = await fetchCurrentSaleValues(callSession.sale.id);
    await captureCorrection({
      saleId: callSession.sale.id,
      directDebitMandateId: callSession.sale.directDebitMandate?.id ?? null,
      verificationSessionId: callSession.verificationSession.id,
      state,
      field: correction.field,
      oldValue: resolveOldValue(currentSale, correction.field),
      rawNewValue: correction.value,
    });
  }
}
