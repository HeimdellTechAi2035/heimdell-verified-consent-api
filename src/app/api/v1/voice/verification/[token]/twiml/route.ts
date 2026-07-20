// POST /api/v1/voice/verification/[token]/twiml
// Twilio fetches this when the outbound verification call is answered.
// Returns the disclosure script + press-1/press-2 gather prompt as TwiML.

import { type NextRequest, NextResponse } from "next/server";
import { verifyTwilioRequest, TwilioSignatureError, buildCanonicalTwilioUrl } from "@/lib/twilio-signature";
import { lookupVerificationSession } from "@/lib/session-lookup";
import { db } from "@/lib/db";
import { generateSecureToken, hashToken } from "@/lib/crypto";
import {
  buildVerificationScriptTwiml,
  buildInvalidRequestTwiml,
  buildConversationRelayTwiml,
  buildIdentityGreetingText,
} from "@/lib/voice-twiml";

// How long the ConversationRelay WS token stays valid for after /twiml is
// served -- generous for a phone call (which normally finishes in well
// under 15 minutes) while still bounding how long a token could be
// replayed if it were ever somehow intercepted in transit to Twilio.
const WS_TOKEN_TTL_MS = 30 * 60 * 1000;

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Mints a fresh, single-attempt-scoped token for the ConversationRelay WS
 * handoff and stores its hash on the matching PhoneVerificationAttempt
 * (looked up by Twilio's own CallSid, from this signature-verified
 * request). Returns null if no attempt row exists yet for this CallSid --
 * the caller falls back to the legacy script rather than ever reusing the
 * customer's own web-link token as a substitute.
 */
async function mintCallWsToken(callSid: string): Promise<string | null> {
  const rawToken = generateSecureToken();
  const result = await db.phoneVerificationAttempt.updateMany({
    where: { providerCallSid: callSid },
    data: {
      wsTokenHash: hashToken(rawToken),
      wsTokenExpiresAt: new Date(Date.now() + WS_TOKEN_TTL_MS),
    },
  });

  return result.count > 0 ? rawToken : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  let formParams: Record<string, string>;
  try {
    formParams = await verifyTwilioRequest(req);
  } catch (err) {
    if (err instanceof TwilioSignatureError) {
      console.error("[voice/twiml] signature verification failed:", err.message);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  const { token } = await params;
  const lookup = await lookupVerificationSession(token);

  if (!lookup.ok) {
    return xmlResponse(buildInvalidRequestTwiml());
  }

  const { data } = lookup;

  // Conversational voice agent cutover -- permanent per-environment toggle,
  // not a one-way migration. Only takes effect once both the flag AND the
  // WS base URL are set, so a half-configured environment never silently
  // produces a broken call; otherwise falls through to the legacy script
  // below completely unchanged.
  if (process.env.VOICE_AGENT_ENABLED === "true" && process.env.VOICE_AGENT_WS_URL) {
    // Mint a one-time, call-specific token for the ConversationRelay WS
    // connection here, in this signature-verified request, rather than
    // reusing `token` -- `token` is the SAME secret handed to the customer
    // for the web verification page, so reusing it would mean anyone who
    // obtained that link (a forwarded email, a screenshot) could open a
    // raw WebSocket straight to voice-agent-service and drive the whole
    // state machine themselves, no phone call or Twilio involved.
    const callSid = formParams.CallSid ?? null;
    const wsToken = callSid
      ? await mintCallWsToken(callSid)
      : null;

    if (wsToken) {
      const wsBase = process.env.VOICE_AGENT_WS_URL.replace(/\/$/, "");
      const welcomeGreeting = buildIdentityGreetingText(
        data.customer.full_name,
        data.product.name,
        data.client_name
      );
      return xmlResponse(
        buildConversationRelayTwiml({ wsUrl: `${wsBase}/call/${wsToken}`, welcomeGreeting })
      );
    }

    // No CallSid on the request, or no matching PhoneVerificationAttempt --
    // can't safely mint a scoped WS token, so fall through to the legacy
    // script below rather than either failing the call outright or falling
    // back to the insecure customer-token reuse this fix removes.
    console.error("[voice/twiml] could not mint a WS token, falling back to legacy script", {
      hasCallSid: Boolean(callSid),
    });
  }

  const gatherActionUrl = buildCanonicalTwilioUrl(req).replace("/twiml", "/gather");

  const xml = buildVerificationScriptTwiml({
    customerName: data.customer.full_name,
    productName: data.product.name,
    subscriptionPrice: data.product.subscription_price,
    subscriptionFrequency: data.product.subscription_frequency,
    termsSummary: data.product.subscription_terms_summary,
    policiesSummary: data.product.policies_summary,
    termsAndConditions: data.policy_snapshot.termsAndConditions,
    coolingOffPolicy: data.policy_snapshot.coolingOffPolicy,
    cancellationInstructions: data.policy_snapshot.cancellationInstructions,
    directDebitGuaranteeWording: data.policy_snapshot.directDebitGuaranteeWording,
    gatherActionUrl,
  });

  return xmlResponse(xml);
}
