// Twilio ConversationRelay's WS message protocol. ConversationRelay is a
// relatively new Twilio feature -- the shapes below are the best-current
// understanding and MUST be reconciled against Twilio's live docs during
// the first real test call (Phase C), particularly:
//   - exact field casing on `setup` (callSid vs CallSid, whether
//     `customParameters` carries any <Parameter> children)
//   - whether `prompt` ever arrives with partial/interim transcripts
//     (a `last: false` variant) or only finalized utterances
//   - the exact shape of the end-of-call / handoff message
// Unrecognized message shapes are rejected rather than guessed at, since
// silently misinterpreting a message on a compliance-relevant call is worse
// than failing loudly.

export type InboundSetupMessage = {
  type: "setup";
  callSid: string;
  accountSid?: string;
  from?: string;
  to?: string;
  customParameters?: Record<string, string>;
};

export type InboundPromptMessage = {
  type: "prompt";
  voicePrompt: string;
  lang?: string;
  last?: boolean;
};

export type InboundInterruptMessage = {
  type: "interrupt";
  utteranceUntilInterrupt?: string;
  durationUntilInterruptMs?: number;
};

export type InboundDtmfMessage = {
  type: "dtmf";
  digit: string;
};

export type InboundErrorMessage = {
  type: "error";
  description?: string;
};

export type InboundMessage =
  | InboundSetupMessage
  | InboundPromptMessage
  | InboundInterruptMessage
  | InboundDtmfMessage
  | InboundErrorMessage;

export type OutboundTextMessage = {
  type: "text";
  token: string;
  last: boolean;
};

export type OutboundEndMessage = {
  type: "end";
  handoffData?: string;
};

export type OutboundMessage = OutboundTextMessage | OutboundEndMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Hand-rolled type guard rather than a zod schema -- these messages are
 * small, fixed-shape, and on the hot path of every conversation turn; a
 * guard keeps this dependency-free and fast. Returns null (not a throw) on
 * anything unrecognized so the caller can log-and-close instead of crashing
 * the whole process on one malformed frame.
 */
export function parseInboundMessage(raw: string): InboundMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  switch (parsed.type) {
    case "setup":
      return typeof parsed.callSid === "string" ? (parsed as InboundSetupMessage) : null;
    case "prompt":
      return typeof parsed.voicePrompt === "string" ? (parsed as InboundPromptMessage) : null;
    case "interrupt":
      return parsed as InboundInterruptMessage;
    case "dtmf":
      return typeof parsed.digit === "string" ? (parsed as InboundDtmfMessage) : null;
    case "error":
      return parsed as InboundErrorMessage;
    default:
      return null;
  }
}

export function serializeOutboundMessage(message: OutboundMessage): string {
  return JSON.stringify(message);
}
