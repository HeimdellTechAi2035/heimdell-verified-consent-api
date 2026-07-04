// POST /api/v1/voice/verification/[token]/gather
// Twilio posts here with the customer's DTMF digit after the press-1/
// press-2 prompt. "1" completes the verification (same certificate/
// consent-event path as the web flow); "2" declines it. Silence/invalid
// input gets exactly one re-prompt -- a dropped call or bad line must
// never auto-decline, only an explicit "2" does.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { verifyTwilioRequest, TwilioSignatureError, buildCanonicalTwilioUrl } from "@/lib/twilio-signature";
import { completeVerificationSession } from "@/lib/verification-completion";
import { declineVerificationSession } from "@/lib/verification-decline";
import {
  buildCompletedTwiml,
  buildDeclinedTwiml,
  buildRepromptTwiml,
  buildNoResponseTwiml,
  buildAlreadyResolvedTwiml,
  buildInvalidRequestTwiml,
} from "@/lib/voice-twiml";
import {
  sendVerificationCompletedNotification,
  sendCertificateCreatedNotification,
  sendVerificationDeclinedNotification,
} from "@/lib/notifications";

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const isReprompt = req.nextUrl.searchParams.get("attempt") === "2";

  let formParams: Record<string, string>;
  try {
    formParams = await verifyTwilioRequest(req);
  } catch (err) {
    if (err instanceof TwilioSignatureError) {
      console.error("[voice/gather] signature verification failed:", err.message);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  const { token } = await params;
  const tokenHash = hashToken(token);
  const digits = formParams.Digits ?? "";
  const callSid = formParams.CallSid ?? null;

  const session = await db.verificationSession.findUnique({
    where: { tokenHash },
    include: {
      sale: {
        include: {
          client: true,
          directDebitMandate: {
            select: {
              bankName: true,
              sortCode: true,
              accountNumberLast4: true,
              accountHolderName: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    return xmlResponse(buildInvalidRequestTwiml());
  }

  const { sale } = session;

  if (digits === "1") {
    const result = await completeVerificationSession({
      session,
      sale,
      evidence: {
        method: "phone_call",
        call_sid: callSid ?? "unknown",
        digits_pressed: digits,
        phone_number: sale.customerPhone ?? formParams.From ?? "",
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
      return xmlResponse(buildAlreadyResolvedTwiml(result.reason));
    }

    if (callSid) {
      await db.phoneVerificationAttempt.updateMany({
        where: { providerCallSid: callSid },
        data: { digitsPressed: digits, status: "COMPLETED", completedAt: result.completedAt },
      });
    }

    const notifyParams = {
      saleId: sale.id,
      verificationSessionId: session.id,
      customerPhone: sale.customerPhone ?? null,
      customerEmail: sale.customerEmail ?? null,
      clientWebhookUrl: sale.client.webhookUrl ?? null,
      webhookSecret: sale.client.webhookSecret ?? null,
    };
    sendVerificationCompletedNotification(notifyParams).catch((err) =>
      console.error("[voice/gather] completed notification error:", err)
    );
    sendCertificateCreatedNotification({
      saleId: sale.id,
      certificateId: result.certificateId,
      clientWebhookUrl: sale.client.webhookUrl ?? null,
      webhookSecret: sale.client.webhookSecret ?? null,
    }).catch((err) => console.error("[voice/gather] certificate notification error:", err));

    return xmlResponse(buildCompletedTwiml());
  }

  if (digits === "2") {
    const result = await declineVerificationSession({
      session: {
        id: session.id,
        saleId: sale.id,
        status: session.status,
        expiresAt: session.expiresAt,
        declinedAt: session.declinedAt,
      },
      reason: "Declined via automated phone verification call",
      metadata: { via: "phone_call", call_sid: callSid },
    });

    if (!result.ok) {
      return xmlResponse(buildAlreadyResolvedTwiml(result.reason));
    }

    if (callSid) {
      await db.phoneVerificationAttempt.updateMany({
        where: { providerCallSid: callSid },
        data: { digitsPressed: digits, status: "COMPLETED", completedAt: result.declinedAt },
      });
    }

    sendVerificationDeclinedNotification({
      saleId: sale.id,
      verificationSessionId: session.id,
      customerPhone: sale.customerPhone ?? null,
      customerEmail: sale.customerEmail ?? null,
      clientWebhookUrl: sale.client.webhookUrl ?? null,
      webhookSecret: sale.client.webhookSecret ?? null,
    }).catch((err) => console.error("[voice/gather] decline notification error:", err));

    return xmlResponse(buildDeclinedTwiml());
  }

  // No/invalid digits.
  if (isReprompt) {
    // Second attempt also failed -- give up without touching session/sale
    // status. The web link remains valid as a fallback.
    return xmlResponse(buildNoResponseTwiml());
  }

  const repromptUrl = `${buildCanonicalTwilioUrl(req)}?attempt=2`;
  return xmlResponse(buildRepromptTwiml(repromptUrl));
}
