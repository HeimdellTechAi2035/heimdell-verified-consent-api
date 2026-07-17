import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CONVERSATION_MODEL } from "../claude/client";
import { ADVANCE_CONVERSATION_TOOL, type AdvanceConversationToolInput } from "../claude/state-transition-tool";
import { STATE_DEFINITIONS } from "./definitions";
import type { ConversationStateId, StateContext, StateDefinition, StateId, StateMachineResult } from "./types";

function legalTransitionsFor(definition: StateDefinition): StateId[] {
  // Includes the state's own id -- Claude needs a "still waiting for a
  // clear answer" option (the opening greeting, or a re-prompt after an
  // ambiguous reply), not just forward/branch transitions. Self-transitions
  // never record a consent event, since positiveTransition is always a
  // different state.
  return [definition.id, definition.positiveTransition, ...definition.otherTransitions];
}

function buildFullSystemPrompt(definition: StateDefinition, ctx: StateContext): string {
  const corePrompt = definition.buildSystemPrompt(ctx);
  return `${corePrompt}

You must call advance_conversation exactly once per turn. If you have not yet received a clear, unambiguous answer to what you just asked -- including if this is the very first turn of the call and you have not asked anything yet -- set next_state to "${definition.id}" (stay here) and use reply_text to ask or re-ask the question. Only choose one of the other transitions named above once you have a clear answer.

If next_state is DIFFERENT from "${definition.id}" (a genuine move to a new topic, not re-asking something within this same topic): briefly acknowledge what was just confirmed, then end reply_text with a short, clear readiness question such as "Are you ready to proceed?" -- do not ask the new topic's specific question yet, that happens on your next turn once they've confirmed. If next_state is "${definition.id}" (you are staying on this same topic, asking again or continuing to work through it), just ask your normal question directly -- no separate readiness question needed there.`;
}

function extractToolInput(response: Anthropic.Message): AdvanceConversationToolInput | null {
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUseBlock || toolUseBlock.name !== "advance_conversation") {
    return null;
  }

  return toolUseBlock.input as AdvanceConversationToolInput;
}

export type AdvanceTurnResult =
  | { ok: true; result: StateMachineResult; consentEventRecorded: boolean }
  | { ok: false; reason: "NO_TOOL_CALL" | "ILLEGAL_TRANSITION" }
  | { ok: false; reason: "API_ERROR"; error: unknown };

/**
 * Runs one conversation turn: the customer's utterance is already appended
 * to ctx.turnHistory by the caller. Calls Claude with tool_choice forced to
 * advance_conversation so state routing is always a structured decision,
 * then validates the chosen next_state against this state's own legal
 * transitions -- Claude's choice is never trusted unconditionally.
 *
 * The Claude call itself is caught separately from tool-parsing failures --
 * a transient API error (e.g. Anthropic returning 529 overloaded, seen on
 * a real test call) needs different handling from the caller: no amount of
 * "could you repeat that?" fixes an API outage, so this is reported as its
 * own reason rather than folded into NO_TOOL_CALL.
 */
export async function advanceConversationTurn(
  currentStateId: ConversationStateId,
  ctx: StateContext
): Promise<AdvanceTurnResult> {
  const definition = STATE_DEFINITIONS[currentStateId];
  const systemPrompt = buildFullSystemPrompt(definition, ctx);

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: CONVERSATION_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: ctx.turnHistory.map((turn) => ({ role: turn.role, content: turn.content })),
      tools: [ADVANCE_CONVERSATION_TOOL],
      tool_choice: { type: "tool", name: "advance_conversation" },
    });
  } catch (error) {
    return { ok: false, reason: "API_ERROR", error };
  }

  const toolInput = extractToolInput(response);
  if (!toolInput) {
    return { ok: false, reason: "NO_TOOL_CALL" };
  }

  const legalTransitions = legalTransitionsFor(definition);
  if (!legalTransitions.includes(toolInput.next_state as StateId)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION" };
  }

  const nextState = toolInput.next_state as StateId;
  const consentEventRecorded = nextState === definition.positiveTransition && Boolean(definition.consentEventOnSuccess);

  return {
    ok: true,
    result: {
      replyText: toolInput.reply_text,
      nextState,
      capturedData: toolInput.captured_data,
    },
    consentEventRecorded,
  };
}

export function getStateDefinition(id: ConversationStateId): StateDefinition {
  return STATE_DEFINITIONS[id];
}
