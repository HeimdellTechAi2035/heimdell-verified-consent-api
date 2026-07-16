import type { Prisma } from "@prisma/client";
import type { WebSocket } from "ws";
import { db } from "@/lib/db";
import { bootstrapCallSession, type CallSession } from "../session/session-bootstrap";
import { recordLiveConsentEvent } from "../consent-events";
import { advanceConversationTurn, getStateDefinition } from "../states/state-machine";
import { handleTerminalOutcome } from "../states/terminal-outcomes";
import { isTerminalState, type ConversationStateId, type ConversationTurn, type TerminalStateId } from "../states/types";
import { parseInboundMessage, serializeOutboundMessage, type InboundMessage } from "./protocol";

const OPENING_TURN: ConversationTurn = {
  role: "user",
  content: "[Call connected. Begin the conversation now.]",
};

// Used to immediately chain into a new state's own opening line right
// after a real transition, in the same spoken breath -- not shown in the
// transcript (nothing was actually said here), only in turnHistory so
// Claude understands why it's being asked to speak again with no new
// customer input.
const CONTINUATION_TURN: ConversationTurn = {
  role: "user",
  content: "[Continue -- the customer just answered. Move straight into your next question, no need to ask permission to continue.]",
};

const FALLBACK_REPLY = "Sorry, could you say that again?";
const API_ERROR_REPLY =
  "Sorry, I'm having a technical difficulty right now. Someone from our team will follow up with you directly to complete this. Thank you for your time, goodbye.";
const REPEATED_FAILURE_REPLY =
  "Sorry, I'm having trouble understanding. Someone from our team will follow up with you directly to complete this. Thank you for your time, goodbye.";

// A real test call hit repeated Anthropic 529 "Overloaded" errors and, with
// no handling beyond a console.error, went completely silent for minutes
// before the connection eventually dropped. Any API failure now speaks an
// apology and ends the call cleanly; a Claude response that's merely
// unparseable (no tool call / illegal transition) gets one soft re-prompt,
// but forces the same clean ending after two in a row, rather than looping
// indefinitely.
const MAX_CONSECUTIVE_SOFT_FAILURES = 2;

// Caps how many states advance_conversation can chain through in one
// customer turn (see runChainedTurns below) -- a safety valve against any
// pathological run of states that all transition immediately with no real
// question, so a single customer utterance can never cause an unbounded
// run of Claude calls.
const MAX_CHAIN_HOPS = 4;

function send(socket: WebSocket, message: Parameters<typeof serializeOutboundMessage>[0]) {
  socket.send(serializeOutboundMessage(message));
}

type SingleTurnOutcome =
  | { status: "continue" | "advance"; replyText: string; nextState: ConversationStateId }
  | { status: "terminal"; replyText: string; nextState: TerminalStateId }
  | { status: "force_end"; replyText: string };

/** Runs exactly one Claude turn against whatever is currently at the end of turnHistory, records a live ConsentEvent if earned, and classifies the result for the chaining orchestrator below. Does not send anything over the socket itself. */
async function runSingleTurn(
  currentState: ConversationStateId,
  callSession: CallSession,
  callSid: string,
  turnHistory: ConversationTurn[],
  failureState: { consecutiveFailures: number }
): Promise<SingleTurnOutcome> {
  const turn = await advanceConversationTurn(currentState, { callSession, turnHistory });

  if (!turn.ok) {
    console.error(`[voice-agent] ${turn.reason} in state ${currentState}, call ${callSid}`, "error" in turn ? turn.error : "");

    if (turn.reason === "API_ERROR") {
      return { status: "force_end", replyText: API_ERROR_REPLY };
    }

    failureState.consecutiveFailures += 1;
    if (failureState.consecutiveFailures > MAX_CONSECUTIVE_SOFT_FAILURES) {
      return { status: "force_end", replyText: REPEATED_FAILURE_REPLY };
    }

    return { status: "continue", replyText: FALLBACK_REPLY, nextState: currentState };
  }

  failureState.consecutiveFailures = 0;
  const { replyText, nextState, capturedData } = turn.result;

  if (turn.consentEventRecorded) {
    const definition = getStateDefinition(currentState);
    if (definition.consentEventOnSuccess) {
      try {
        await recordLiveConsentEvent(
          callSession.verificationSession.id,
          definition.consentEventOnSuccess,
          { via: "phone_call_agent", state: currentState, ...capturedData }
        );
      } catch (err) {
        console.error(`[voice-agent] failed to record consent event for state ${currentState}, call ${callSid}:`, err);
      }
    }
  }

  if (isTerminalState(nextState)) {
    return { status: "terminal", replyText, nextState };
  }

  return {
    status: nextState === currentState ? "continue" : "advance",
    replyText,
    nextState: nextState as ConversationStateId,
  };
}

type ChainResult =
  | { kind: "waiting"; state: ConversationStateId }
  | { kind: "terminal"; state: TerminalStateId }
  | { kind: "force_end" };

/**
 * Runs one customer turn, then immediately chains through any number of
 * "advance" transitions (a real move to a new state) without waiting for
 * further customer input -- each chained state's own opening line is
 * spoken right after the previous segment, all as one continuous
 * utterance (only the very last segment is sent with last: true, so
 * Twilio doesn't start listening until the whole thing has been said).
 *
 * This is specifically what fixes "the agent says 'we'll move on' then
 * goes silent": a transition's acknowledgement and the new state's real
 * question used to be split across two separate turns with a customer
 * response expected in between, because each state's system prompt only
 * knows its own content -- IDENTITY_CHECK has no idea what
 * SIGNUP_CONFIRMATION is going to ask, so it can't have generated that
 * question. Chaining runs that next state's turn immediately instead.
 */
async function runChainedTurns(
  socket: WebSocket,
  startState: ConversationStateId,
  callSession: CallSession,
  callSid: string,
  turnHistory: ConversationTurn[],
  transcript: ConversationTurn[],
  failureState: { consecutiveFailures: number }
): Promise<ChainResult> {
  let state = startState;
  const segments: string[] = [];

  for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
    const outcome = await runSingleTurn(state, callSession, callSid, turnHistory, failureState);

    turnHistory.push({ role: "assistant", content: outcome.replyText });
    transcript.push({ role: "assistant", content: outcome.replyText });
    segments.push(outcome.replyText);

    if (outcome.status === "force_end") {
      segments.forEach((segment, i) => send(socket, { type: "text", token: segment, last: i === segments.length - 1 }));
      return { kind: "force_end" };
    }

    if (outcome.status === "terminal") {
      segments.forEach((segment, i) => send(socket, { type: "text", token: segment, last: i === segments.length - 1 }));
      return { kind: "terminal", state: outcome.nextState };
    }

    state = outcome.nextState;

    if (outcome.status === "continue") {
      segments.forEach((segment, i) => send(socket, { type: "text", token: segment, last: i === segments.length - 1 }));
      return { kind: "waiting", state };
    }

    // status === "advance": chain immediately into the new state's own
    // opening line, no customer input in between.
    turnHistory.push(CONTINUATION_TURN);
  }

  // Hit MAX_CHAIN_HOPS -- stop chaining as a safety valve, speak what's
  // been said so far, and wait for real customer input rather than risk
  // an unbounded run of Claude calls on one utterance.
  segments.forEach((segment, i) => send(socket, { type: "text", token: segment, last: i === segments.length - 1 }));
  return { kind: "waiting", state };
}

async function recordTechnicalFailureOutcome(callSid: string, transcript: ConversationTurn[]) {
  try {
    await db.phoneVerificationAttempt.updateMany({
      where: { providerCallSid: callSid },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outcome: "NEEDS_FOLLOWUP_TECHNICAL_ERROR",
        transcript: transcript as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[voice-agent] failed to record technical-failure outcome for call ${callSid}:`, err);
  }
}

export async function handleConversationRelayConnection(socket: WebSocket, token: string): Promise<void> {
  let callSid: string | null = null;
  let callSession: CallSession | null = null;
  let currentState: ConversationStateId = "IDENTITY_CHECK";
  const turnHistory: ConversationTurn[] = [OPENING_TURN];
  const transcript: ConversationTurn[] = [];
  let resolved = false;
  let turnInProgress = false;
  const failureState = { consecutiveFailures: 0 };
  // Twilio has been observed sending a "prompt" before "setup" has finished
  // processing (a real race, seen on a live call, that silently dropped
  // the customer's first utterance and then the whole connection died) --
  // queue it instead of discarding it, and drain the queue once setup
  // completes.
  const queuedPrompts: string[] = [];

  async function handleChain(startState: ConversationStateId) {
    if (!callSession || !callSid) {
      return;
    }

    const result = await runChainedTurns(socket, startState, callSession, callSid, turnHistory, transcript, failureState);

    if (result.kind === "force_end") {
      resolved = true;
      await recordTechnicalFailureOutcome(callSid, transcript);
      send(socket, { type: "end" });
      socket.close();
      return;
    }

    if (result.kind === "terminal") {
      resolved = true;
      await handleTerminalOutcome({
        callSession,
        callSid,
        terminalState: result.state,
        transcript,
      });
      send(socket, { type: "end" });
      socket.close();
      return;
    }

    currentState = result.state;
  }

  async function handlePrompt(voicePrompt: string) {
    if (turnInProgress) {
      console.log(`[voice-agent] dropping prompt while a turn is already in progress for call ${callSid}: ${voicePrompt}`);
      return;
    }

    turnInProgress = true;
    turnHistory.push({ role: "user", content: voicePrompt });
    transcript.push({ role: "user", content: voicePrompt });

    try {
      await handleChain(currentState);
    } finally {
      turnInProgress = false;
    }
  }

  async function handleMessage(message: InboundMessage) {
    if (message.type === "setup") {
      callSid = message.callSid;
      const bootstrap = await bootstrapCallSession(token);
      if (!bootstrap.ok) {
        console.error(`[voice-agent] bootstrap failed (${bootstrap.reason}) for call ${callSid}`);
        send(socket, {
          type: "text",
          token: "Sorry, this verification link is no longer valid. Goodbye.",
          last: true,
        });
        socket.close();
        return;
      }

      callSession = bootstrap.session;

      await db.phoneVerificationAttempt.updateMany({
        where: { providerCallSid: callSid },
        data: { status: "IN_PROGRESS", answeredAt: new Date() },
      });

      // The opening turn: Claude delivers the greeting (and chains straight
      // into identity confirmation logic) with no customer input yet, per
      // the self-transition rule in buildFullSystemPrompt.
      turnInProgress = true;
      try {
        await handleChain(currentState);
      } finally {
        turnInProgress = false;
      }

      // Drain anything that arrived before setup finished.
      while (!resolved && queuedPrompts.length > 0) {
        const next = queuedPrompts.shift();
        if (next !== undefined) {
          await handlePrompt(next);
        }
      }
      return;
    }

    if (message.type === "prompt") {
      if (message.last === false) {
        // Interim (non-final) transcript -- a real test call showed the
        // agent repeating itself, almost certainly caused by processing
        // these as if they were complete customer turns.
        console.log(`[voice-agent] skipping non-final prompt for call ${callSid ?? "unknown"}: ${message.voicePrompt}`);
        return;
      }

      if (!callSession || !callSid) {
        console.log(`[voice-agent] prompt arrived before setup completed for call ${callSid ?? "unknown"}, queueing`);
        queuedPrompts.push(message.voicePrompt);
        return;
      }

      await handlePrompt(message.voicePrompt);
      return;
    }

    if (message.type === "interrupt" || message.type === "error") {
      console.log(`[voice-agent] ${message.type} on call ${callSid ?? "unknown"}`);
    }
  }

  socket.on("message", (data) => {
    void (async () => {
      const message = parseInboundMessage(data.toString());
      if (!message) {
        console.error(`[voice-agent] unrecognized WS message, closing: ${data.toString().slice(0, 200)}`);
        socket.close();
        return;
      }

      try {
        await handleMessage(message);
      } catch (err) {
        console.error(`[voice-agent] error handling ${message.type} for call ${callSid ?? "unknown"}:`, err);
        // Last-resort safety net -- every specific failure path above
        // already speaks an apology and ends cleanly, but if something
        // genuinely unexpected throws here, the customer must still never
        // be left in silence for the rest of the call.
        if (!resolved && callSid) {
          resolved = true;
          send(socket, { type: "text", token: API_ERROR_REPLY, last: true });
          await recordTechnicalFailureOutcome(callSid, transcript);
          send(socket, { type: "end" });
          socket.close();
        }
      }
    })();
  });

  socket.on("close", () => {
    void (async () => {
      if (resolved || !callSid) {
        return;
      }
      // The call ended without reaching a terminal state (e.g. the customer
      // hung up mid-conversation) -- the granular ConsentEvents already
      // written live up to this point remain a genuine partial audit trail;
      // just tag the attempt so it's easy to find.
      try {
        await db.phoneVerificationAttempt.updateMany({
          where: { providerCallSid: callSid },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            outcome: "DISCONNECTED",
            transcript: transcript as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        console.error(`[voice-agent] failed to record disconnect outcome for call ${callSid}:`, err);
      }
    })();
  });
}
