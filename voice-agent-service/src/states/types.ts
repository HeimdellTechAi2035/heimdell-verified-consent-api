import type { ConsentEventType } from "@prisma/client";
import type { CallSession } from "../session/session-bootstrap";

export const CONVERSATION_STATE_IDS = [
  "IDENTITY_CHECK",
  "SIGNUP_CONFIRMATION",
  "NAME_ADDRESS",
  "PRODUCT_CONFIRMATION",
  "TERMS_UNDERSTANDING",
  "POLICY_FAQ",
  "DIRECT_DEBIT",
  "EXPLICIT_AGREEMENT",
] as const;

export const TERMINAL_STATE_IDS = [
  "COMPLETED",
  "WRONG_NUMBER",
  "STOP_REQUESTED",
  "SIGNUP_UNCONFIRMED_FOLLOWUP",
  "TERMS_NOT_UNDERSTOOD_FOLLOWUP",
  "OBJECTION_FOLLOWUP",
  "DD_MISMATCH_FOLLOWUP",
  "AGREEMENT_REFUSED",
] as const;

export type ConversationStateId = (typeof CONVERSATION_STATE_IDS)[number];
export type TerminalStateId = (typeof TERMINAL_STATE_IDS)[number];
export type StateId = ConversationStateId | TerminalStateId;

export function isTerminalState(id: StateId): id is TerminalStateId {
  return (TERMINAL_STATE_IDS as readonly string[]).includes(id);
}

export type ConversationTurn = { role: "assistant" | "user"; content: string };

export type StateContext = {
  callSession: CallSession;
  turnHistory: ConversationTurn[];
};

/** One state's static Voiceflow-derived instructions, rendered with real sale data. */
export type StateDefinition = {
  id: ConversationStateId;
  /** The one "this went fine, move the conversation forward" transition. */
  positiveTransition: StateId;
  /** Every other legal transition (branches to a followup/terminal state) -- together with positiveTransition, this is the full set Claude's choice is validated against, never trusted blindly. */
  otherTransitions: StateId[];
  /** The ConsentEventType recorded live, only when Claude's chosen next_state === positiveTransition. */
  consentEventOnSuccess?: ConsentEventType;
  buildSystemPrompt: (ctx: StateContext) => string;
};

export type StateMachineResult = {
  replyText: string;
  nextState: StateId;
  capturedData?: Record<string, unknown>;
};
