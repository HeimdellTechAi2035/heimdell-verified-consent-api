import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { completeVerificationSession } from "@/lib/verification-completion";
import { declineVerificationSession } from "@/lib/verification-decline";
import {
  sendVerificationCompletedNotification,
  sendCertificateCreatedNotification,
  sendVerificationDeclinedNotification,
} from "@/lib/notifications";
import type { CallSession } from "../session/session-bootstrap";
import type { ConversationTurn, TerminalStateId } from "./types";

export type TerminalOutcomeParams = {
  callSession: CallSession;
  callSid: string;
  terminalState: TerminalStateId;
  transcript: ConversationTurn[];
};

type DeclineEligibleState = Exclude<TerminalStateId, "COMPLETED" | "WRONG_NUMBER">;

// Every non-completed, non-wrong-number outcome goes through the same
// declineVerificationSession() call the legacy DTMF flow already uses --
// only the reason and the queryable outcome code differ per branch, so
// staff can find follow-up work (`outcome LIKE 'NEEDS_FOLLOWUP%'`) without
// a JSON-path query into ConsentEvent.
const DECLINE_REASONS: Record<DeclineEligibleState, string> = {
  STOP_REQUESTED: "Customer requested no further contact",
  SIGNUP_UNCONFIRMED_FOLLOWUP: "Signup not confirmed -- customer uncertain, needs follow-up",
  TERMS_NOT_UNDERSTOOD_FOLLOWUP: "Customer did not understand the terms after explanation",
  OBJECTION_FOLLOWUP: "Customer raised an objection and did not wish to continue",
  DD_MISMATCH_FOLLOWUP: "Direct Debit details could not be verified",
  AGREEMENT_REFUSED: "Customer declined to give explicit agreement",
};

const OUTCOME_CODES: Record<DeclineEligibleState, string> = {
  STOP_REQUESTED: "STOP_REQUESTED",
  SIGNUP_UNCONFIRMED_FOLLOWUP: "NEEDS_FOLLOWUP_SIGNUP_UNCONFIRMED",
  TERMS_NOT_UNDERSTOOD_FOLLOWUP: "NEEDS_FOLLOWUP_TERMS_NOT_UNDERSTOOD",
  OBJECTION_FOLLOWUP: "NEEDS_FOLLOWUP_OBJECTION",
  DD_MISMATCH_FOLLOWUP: "NEEDS_FOLLOWUP_DD_MISMATCH",
  AGREEMENT_REFUSED: "AGREEMENT_REFUSED",
};

function isDeclineEligible(state: TerminalStateId): state is DeclineEligibleState {
  return state !== "COMPLETED" && state !== "WRONG_NUMBER";
}

async function recordAttemptOutcome(
  callSid: string,
  outcome: string,
  completedAt: Date,
  transcript: ConversationTurn[]
) {
  await db.phoneVerificationAttempt.updateMany({
    where: { providerCallSid: callSid },
    data: {
      status: "COMPLETED",
      completedAt,
      outcome,
      transcript: transcript as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function handleTerminalOutcome(params: TerminalOutcomeParams): Promise<void> {
  const { callSession, callSid, terminalState, transcript } = params;
  const { verificationSession, sale } = callSession;

  if (terminalState === "COMPLETED") {
    const result = await completeVerificationSession({
      session: verificationSession,
      sale,
      evidence: {
        method: "phone_call_agent",
        call_sid: callSid,
        phone_number: sale.customerPhone ?? "",
        call_completed_at: new Date(),
        terms_acknowledged: true,
        policies_acknowledged: true,
        cooling_off_acknowledged: true,
        direct_debit_authorised: true,
        evidence_storage_acknowledged: true,
        ai_consent_confirmed: false,
      },
    });

    if (!result.ok) {
      console.error(`[voice-agent] completeVerificationSession failed: ${result.reason}`);
      return;
    }

    await recordAttemptOutcome(callSid, "COMPLETED", result.completedAt, transcript);

    const clientWebhookUrl = sale.client.webhookUrl ?? null;
    const webhookSecret = sale.client.webhookSecret ?? null;

    try {
      await sendVerificationCompletedNotification({
        saleId: sale.id,
        verificationSessionId: verificationSession.id,
        customerPhone: sale.customerPhone ?? null,
        customerEmail: sale.customerEmail ?? null,
        clientWebhookUrl,
        webhookSecret,
      });
      await sendCertificateCreatedNotification({
        saleId: sale.id,
        certificateId: result.certificateId,
        clientWebhookUrl,
        webhookSecret,
      });
    } catch (err) {
      console.error("[voice-agent] completion notification error:", err);
    }
    return;
  }

  if (terminalState === "WRONG_NUMBER") {
    // Mirrors the legacy flow's "no response" rule -- a misdialled number is
    // never a customer decision, so the session/sale status is left
    // untouched and the web link fallback stays valid.
    await recordAttemptOutcome(callSid, "WRONG_NUMBER", new Date(), transcript);
    return;
  }

  if (!isDeclineEligible(terminalState)) {
    return;
  }

  const result = await declineVerificationSession({
    session: {
      id: verificationSession.id,
      saleId: sale.id,
      status: verificationSession.status,
      expiresAt: verificationSession.expiresAt,
      declinedAt: verificationSession.declinedAt,
    },
    reason: DECLINE_REASONS[terminalState],
    metadata: { via: "phone_call_agent", call_sid: callSid, outcome: OUTCOME_CODES[terminalState] },
  });

  if (!result.ok) {
    console.error(`[voice-agent] declineVerificationSession failed: ${result.reason}`);
    return;
  }

  await recordAttemptOutcome(callSid, OUTCOME_CODES[terminalState], result.declinedAt, transcript);

  try {
    await sendVerificationDeclinedNotification({
      saleId: sale.id,
      verificationSessionId: verificationSession.id,
      customerPhone: sale.customerPhone ?? null,
      customerEmail: sale.customerEmail ?? null,
      clientWebhookUrl: sale.client.webhookUrl ?? null,
      webhookSecret: sale.client.webhookSecret ?? null,
    });
  } catch (err) {
    console.error("[voice-agent] decline notification error:", err);
  }
}
