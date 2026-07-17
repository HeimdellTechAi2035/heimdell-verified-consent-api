// POST /api/v1/voice/verification/[token]/twiml
// Twilio fetches this when the outbound verification call is answered.
// Returns the disclosure script + press-1/press-2 gather prompt as TwiML.

import { type NextRequest, NextResponse } from "next/server";
import { verifyTwilioRequest, TwilioSignatureError, buildCanonicalTwilioUrl } from "@/lib/twilio-signature";
import { lookupVerificationSession } from "@/lib/session-lookup";
import {
  buildVerificationScriptTwiml,
  buildInvalidRequestTwiml,
  buildConversationRelayTwiml,
  buildIdentityGreetingText,
} from "@/lib/voice-twiml";

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
  try {
    await verifyTwilioRequest(req);
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
    const wsBase = process.env.VOICE_AGENT_WS_URL.replace(/\/$/, "");
    const welcomeGreeting = buildIdentityGreetingText(
      data.customer.full_name,
      data.product.name,
      data.client_name
    );
    return xmlResponse(
      buildConversationRelayTwiml({ wsUrl: `${wsBase}/call/${token}`, welcomeGreeting })
    );
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
