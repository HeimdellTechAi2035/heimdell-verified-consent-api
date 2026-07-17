// Pure TwiML string builders for phone-call verification. No Prisma/DB
// imports here -- everything takes plain data in and returns an XML
// string, so it's fully unit-testable without a live database or Twilio
// account.

const MAX_SAY_CHARS = 1400; // conservative margin under Twilio's <Say> practical limit

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Splits long text into chunks safe for a single <Say> tag, breaking on
 * sentence/space boundaries where possible rather than mid-word.
 */
export function chunkTextForSay(text: string, maxChars = MAX_SAY_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(". ", maxChars);
    if (splitAt < maxChars * 0.5) {
      splitAt = remaining.lastIndexOf(" ", maxChars);
    }
    if (splitAt < 1) {
      splitAt = maxChars;
    }

    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function sayBlock(text: string): string {
  return chunkTextForSay(text)
    .map((chunk) => `<Say>${escapeXml(chunk)}</Say>`)
    .join("");
}

export type VerificationCallScriptData = {
  customerName: string;
  productName: string;
  subscriptionPrice: string;
  subscriptionFrequency: string | null;
  termsSummary: string | null;
  policiesSummary: string | null;
  termsAndConditions: string;
  coolingOffPolicy: string;
  cancellationInstructions: string;
  directDebitGuaranteeWording: string;
  gatherActionUrl: string;
};

function disclosureSayBlocks(data: VerificationCallScriptData): string {
  const parts: string[] = [
    `This call is being recorded as proof of your agreement, on behalf of the company you are signing up with.`,
    `Hello ${data.customerName}. This automated call is to confirm your order for ${data.productName}, at ${data.subscriptionPrice}${
      data.subscriptionFrequency ? ` ${data.subscriptionFrequency}` : ""
    }.`,
  ];

  if (data.termsSummary) {
    parts.push(data.termsSummary);
  }

  parts.push(data.termsAndConditions);
  parts.push(data.coolingOffPolicy);
  parts.push(data.cancellationInstructions);
  parts.push(data.directDebitGuaranteeWording);

  if (data.policiesSummary) {
    parts.push(data.policiesSummary);
  }

  return parts.map(sayBlock).join("");
}

function gatherPrompt(actionUrl: string): string {
  return (
    `<Gather input="dtmf" numDigits="1" timeout="10" actionOnEmptyResult="true" action="${escapeXml(
      actionUrl
    )}" method="POST">` +
    sayBlock("To confirm you agree to these terms, press 1. To decline, press 2.") +
    `</Gather>`
  );
}

/**
 * The full disclosure script, played once when the call is answered. The
 * disclosure is sequential <Say> verses OUTSIDE any <Gather>, so DTMF
 * barge-in can't register a keypress before the customer has heard
 * everything -- only the final short prompt is wrapped in <Gather>.
 */
export function buildVerificationScriptTwiml(data: VerificationCallScriptData): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    disclosureSayBlocks(data) +
    gatherPrompt(data.gatherActionUrl) +
    sayBlock("We did not receive a response. Goodbye.") +
    `</Response>`
  );
}

/** Used when the first gather attempt got no/invalid input -- one re-prompt only. */
export function buildRepromptTwiml(actionUrl: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    gatherPrompt(actionUrl) +
    sayBlock("We did not receive a response. Goodbye.") +
    `</Response>`
  );
}

export function buildCompletedTwiml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    sayBlock("Thank you. Your agreement has been recorded. Goodbye.") +
    `<Hangup/></Response>`
  );
}

export function buildDeclinedTwiml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    sayBlock("Your decline has been recorded. Goodbye.") +
    `<Hangup/></Response>`
  );
}

/** No mutation happens for a silent/invalid second attempt -- a dropped call or bad line must never auto-decline. */
export function buildNoResponseTwiml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    sayBlock("We did not receive a response. Goodbye.") +
    `<Hangup/></Response>`
  );
}

export function buildAlreadyResolvedTwiml(
  reason: "ALREADY_COMPLETED" | "ALREADY_DECLINED" | "EXPIRED"
): string {
  const message =
    reason === "EXPIRED"
      ? "This verification has expired. Goodbye."
      : "This verification has already been resolved. Goodbye.";

  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` + sayBlock(message) + `<Hangup/></Response>`
  );
}

/**
 * The literal opening line spoken by Twilio's welcomeGreeting for the
 * conversational voice agent, before the WS server or Claude are involved
 * at all. Shared (via relative import) with voice-agent-service's
 * IDENTITY_CHECK prompt, which tells Claude this exact text was already
 * spoken -- keeping both in one place means they can't drift apart.
 */
export function buildIdentityGreetingText(customerName: string, productName: string): string {
  return (
    `This call is being recorded as proof of your agreement. ` +
    `Hi, is that ${customerName}? I'm calling about your signup for ${productName}. It'll take about 5 minutes.`
  );
}

export type ConversationRelayTwimlParams = {
  wsUrl: string;
  voice?: string;
  language?: string;
  /**
   * Spoken by Twilio itself the moment the WebSocket connects, with no
   * round trip to the voice-agent-service (DB lookup + Claude call) in the
   * critical path. A real test call showed multi-second dead air on pickup
   * when the opening line depended on that round trip instead -- the
   * customer heard nothing until they spoke first. Omit to fall back to
   * ConversationRelay's own default (silence until the WS server sends the
   * first "text" message).
   */
  welcomeGreeting?: string;
};

/**
 * Hands the call off to the always-on conversational voice agent service
 * instead of the static disclosure + DTMF script. Gated behind
 * VOICE_AGENT_ENABLED in the /twiml route -- this builder itself has no
 * flag logic, so it stays trivially testable like the other builders here.
 */
export function buildConversationRelayTwiml(params: ConversationRelayTwimlParams): string {
  const voice = params.voice ?? "en-GB-Standard-A";
  const language = params.language ?? "en-GB";
  const welcomeGreetingAttr = params.welcomeGreeting
    ? ` welcomeGreeting="${escapeXml(params.welcomeGreeting)}"`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response><Connect>` +
    `<ConversationRelay url="${escapeXml(params.wsUrl)}" voice="${escapeXml(voice)}" language="${escapeXml(language)}"${welcomeGreetingAttr} />` +
    `</Connect></Response>`
  );
}

export function buildInvalidRequestTwiml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    sayBlock("This verification link is invalid or has expired. Goodbye.") +
    `<Hangup/></Response>`
  );
}
