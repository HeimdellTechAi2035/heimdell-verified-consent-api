// Shared verification-completion logic, used by both the web
// /complete route and the phone-call DTMF "1" (gather) webhook. Guards and
// the certificate/consent-event transaction live here so both callers get
// identical, behavior-preserving handling -- each caller only builds its
// own `evidence` object and formats its own HTTP/TwiML response from the
// neutral result returned here.

import { Prisma } from "@prisma/client";
import type { Client, Sale, VerificationSession } from "@prisma/client";
import { db } from "@/lib/db";
import { createCertificateJson, type CertificateEvidence, type SafeMandate } from "@/lib/certificate";

export type CompleteVerificationSessionParams = {
  session: VerificationSession;
  sale: Sale & { client: Client; directDebitMandate: SafeMandate | null };
  evidence: CertificateEvidence;
};

export type CompleteVerificationSessionResult =
  | { ok: true; certificateId: string; completedAt: Date }
  | { ok: false; reason: "ALREADY_COMPLETED" | "ALREADY_DECLINED" | "EXPIRED" };

function evidenceCompletedAt(evidence: CertificateEvidence): Date {
  return evidence.method === "web" ? evidence.completed_at : evidence.call_completed_at;
}

function buildConsentEvents(
  verificationSessionId: string,
  evidence: CertificateEvidence
): Prisma.ConsentEventCreateManyInput[] {
  if (evidence.method === "web") {
    const { ip_address: ipAddress, user_agent: userAgent } = evidence;
    return [
      {
        verificationSessionId,
        eventType: "TERMS_ACKNOWLEDGED",
        eventPayload: {
          confirm_terms: true,
          confirm_details_correct: evidence.confirm_details_correct,
          confirm_product_price_frequency: evidence.confirm_product_price_frequency,
        } as unknown as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
      {
        verificationSessionId,
        eventType: "POLICIES_ACKNOWLEDGED",
        eventPayload: { confirm_policies: true } as unknown as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
      {
        verificationSessionId,
        eventType: "COOLING_OFF_ACKNOWLEDGED",
        eventPayload: { confirm_cooling_off: true } as unknown as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
      {
        verificationSessionId,
        eventType: "DIRECT_DEBIT_AUTHORISED",
        eventPayload: { authorise_direct_debit: true } as unknown as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
      {
        verificationSessionId,
        eventType: "VERIFICATION_COMPLETED",
        eventPayload: {
          typed_name: evidence.typed_name,
          completed_at: evidence.completed_at.toISOString(),
          confirm_evidence_storage: evidence.evidence_storage_acknowledged,
        } as unknown as Prisma.InputJsonValue,
        ipAddress,
        userAgent,
      },
    ];
  }

  const phoneMetadata = { via: "phone_call", call_sid: evidence.call_sid };
  return [
    {
      verificationSessionId,
      eventType: "TERMS_ACKNOWLEDGED",
      eventPayload: { confirm_terms: true, ...phoneMetadata } as unknown as Prisma.InputJsonValue,
    },
    {
      verificationSessionId,
      eventType: "POLICIES_ACKNOWLEDGED",
      eventPayload: { confirm_policies: true, ...phoneMetadata } as unknown as Prisma.InputJsonValue,
    },
    {
      verificationSessionId,
      eventType: "COOLING_OFF_ACKNOWLEDGED",
      eventPayload: { confirm_cooling_off: true, ...phoneMetadata } as unknown as Prisma.InputJsonValue,
    },
    {
      verificationSessionId,
      eventType: "DIRECT_DEBIT_AUTHORISED",
      eventPayload: { authorise_direct_debit: true, ...phoneMetadata } as unknown as Prisma.InputJsonValue,
    },
    {
      verificationSessionId,
      eventType: "VERIFICATION_COMPLETED",
      eventPayload: {
        digits_pressed: evidence.digits_pressed,
        completed_at: evidence.call_completed_at.toISOString(),
        ...phoneMetadata,
      } as unknown as Prisma.InputJsonValue,
    },
  ];
}

/**
 * The status/expiry guards, exposed standalone so a caller can run its own
 * extra validation (e.g. the web route's typed-name match) in between the
 * guard check and the actual completion, preserving the original
 * guards-then-validate-then-complete ordering exactly.
 */
export async function checkCompletionGuards(
  session: { id: string; status: string; expiresAt: Date },
  at: Date
): Promise<{ ok: false; reason: "ALREADY_COMPLETED" | "ALREADY_DECLINED" | "EXPIRED" } | null> {
  if (session.status === "COMPLETED") {
    return { ok: false, reason: "ALREADY_COMPLETED" };
  }

  if (session.status === "DECLINED") {
    return { ok: false, reason: "ALREADY_DECLINED" };
  }

  if (session.expiresAt < at) {
    await db.verificationSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    return { ok: false, reason: "EXPIRED" };
  }

  return null;
}

export async function completeVerificationSession(
  params: CompleteVerificationSessionParams
): Promise<CompleteVerificationSessionResult> {
  const { session, sale, evidence } = params;
  const completedAt = evidenceCompletedAt(evidence);

  const guardFailure = await checkCompletionGuards(session, completedAt);
  if (guardFailure) {
    return guardFailure;
  }

  const { payload: certPayload, proofHash } = createCertificateJson({ session, sale, evidence });

  try {
    const certificate = await db.$transaction(async (tx) => {
      await tx.consentEvent.createMany({
        data: buildConsentEvents(session.id, evidence),
      });

      await tx.verificationSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED", completedAt },
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "VERIFIED" },
      });

      return tx.certificate.create({
        data: {
          verificationSessionId: session.id,
          certificateJson: { ...certPayload, proof_hash: proofHash } as unknown as Prisma.InputJsonValue,
          proofHash,
        },
        select: { id: true },
      });
    });

    return { ok: true, certificateId: certificate.id, completedAt };
  } catch (err) {
    // P2002 = unique constraint on Certificate.verificationSessionId —
    // a concurrent completion (e.g. web + phone racing) already won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, reason: "ALREADY_COMPLETED" };
    }
    throw err;
  }
}
