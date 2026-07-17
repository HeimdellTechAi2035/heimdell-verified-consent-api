import type { Prisma } from "@prisma/client";
import type { WebSocket } from "ws";
import { db } from "@/lib/db";
import { buildIdentityGreetingText } from "@/lib/voice-twiml";
import { bootstrapCallSession, type CallSession } from "../session/session-bootstrap";
import { recordLiveConsentEvent } from "../consent-events";
import { advanceConversationTurn, getStateDefinition } from "../states/state-machine";
import { handleTerminalOutcome } from "../states/terminal-outcomes";
import { isTerminalState, type ConversationStateId, type ConversationTurn, type TerminalStateId } from "../states/types";
import { parseInboundMessage, serializeOutboundMessage, type InboundMessage } from "./protocol";

// Appended by code, not asked by Claude -- a real test call showed the
// model omitting this at least one transition out of several, since a
// soft "always include this" prompt instruction isn't 100% reliable.
// Generating it here instead guarantees it's said every single time.
const READINESS_QUESTION = "Are you ready to proceed?";

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
 * Runs exactly one customer turn and sends its reply. Deliberately does
 * NOT auto-chain into the next state's opening line on a genuine
 * transition ("advance") -- by explicit product decision, every stage
 * transition ends with its own "Are you ready to proceed?"-style question
 * (see the state-machine.ts system prompt) and waits for a real answer,
 * even though that means an extra round trip per stage. An earlier
 * version of this function did auto-chain to avoid that round trip, but
 * was reverted: the user explicitly wants the readiness question kept.
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
  const outcome = await runSingleTurn(startState, callSession, callSid, turnHistory, failureState);

  const spokenText =
    outcome.status === "advance" ? `${outcome.replyText} ${READINESS_QUESTION}` : outcome.replyText;

  turnHistory.push({ role: "assistant", content: spokenText });
  transcript.push({ role: "assistant", content: spokenText });
  send(socket, { type: "text", token: spokenText, last: true });

  if (outcome.status === "force_end") {
    return { kind: "force_end" };
  }

  if (outcome.status === "terminal") {
    return { kind: "terminal", state: outcome.nextState };
  }

  return { kind: "waiting", state: outcome.nextState };
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
  const turnHistory: ConversationTurn[] = [];
  const transcript: ConversationTurn[] = [];
  let resolved = false;
  let turnInProgress = false;
  const failureState = { consecutiveFailures: 0 };
  // A real test call showed the SAME assistant reply generated twice in a
  // row, each following its own separate "[user] Yes." -- proof that Twilio
  // can deliver a genuine duplicate final transcript for one utterance
  // AFTER the first delivery's turn has already completed, outside the
  // turnInProgress mutex's protection window. Guard against that
  // separately, by content: if the next prompt's text matches the last one
  // actually processed, within a short window, treat it as a duplicate
  // delivery and drop it rather than running a second identical turn.
  let lastProcessedPrompt: { text: string; at: number } | null = null;
  const DUPLICATE_PROMPT_WINDOW_MS = 8_000;
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

    const normalized = voicePrompt.trim().toLowerCase();
    const now = Date.now();
    if (
      lastProcessedPrompt &&
      lastProcessedPrompt.text === normalized &&
      now - lastProcessedPrompt.at < DUPLICATE_PROMPT_WINDOW_MS
    ) {
      console.log(`[voice-agent] dropping duplicate prompt (same text within ${DUPLICATE_PROMPT_WINDOW_MS}ms) for call ${callSid}: ${voicePrompt}`);
      return;
    }
    lastProcessedPrompt = { text: normalized, at: now };

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

      // The opening greeting is spoken by Twilio itself via the
      // ConversationRelay welcomeGreeting attribute (see voice-twiml.ts) --
      // instantly, with no DB/Claude round trip in the way -- so there is
      // nothing for the WS handler to send here. Record it in the
      // transcript for the compliance record, then just wait for the
      // customer's real reply like any other turn.
      const greeting = buildIdentityGreetingText(
        callSession.sale.customerName,
        callSession.sale.productName,
        callSession.sale.client.name
      );
      transcript.push({ role: "assistant", content: greeting });

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
