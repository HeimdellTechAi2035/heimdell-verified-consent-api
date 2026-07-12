import type Anthropic from "@anthropic-ai/sdk";
import { CONVERSATION_STATE_IDS, TERMINAL_STATE_IDS } from "../states/types";

const ALL_STATE_IDS = [...CONVERSATION_STATE_IDS, ...TERMINAL_STATE_IDS];

// Forcing a single tool call (via tool_choice in the caller) means state
// routing is always a structured decision, never parsed out of Claude's
// free-text reply.
export const ADVANCE_CONVERSATION_TOOL: Anthropic.Tool = {
  name: "advance_conversation",
  description:
    "Report what to say to the customer next and which conversation state to move to.",
  input_schema: {
    type: "object",
    properties: {
      reply_text: {
        type: "string",
        description: "Exactly what to say next, in natural spoken English. Keep it short -- this is read aloud on a phone call.",
      },
      next_state: {
        type: "string",
        enum: ALL_STATE_IDS,
        description: "The next conversation state, chosen from this state's allowed transitions only.",
      },
      captured_data: {
        type: "object",
        description: "Any corrected or confirmed field values captured this turn (e.g. a corrected address).",
      },
    },
    required: ["reply_text", "next_state"],
    additionalProperties: false,
  },
};

export type AdvanceConversationToolInput = {
  reply_text: string;
  next_state: string;
  captured_data?: Record<string, unknown>;
};
