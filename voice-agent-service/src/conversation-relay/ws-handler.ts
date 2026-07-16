import type { Prisma } from "@prisma/client";
import type { WebSocket } from "ws";
import { db } from "@/lib/db";
import { bootstrapCallSession, type CallSession } from "../session/session-bootstrap";
import { recordLiveConsentEvent } from "../consent-events";
import { advanceConversationTurn, getStateDefinition } from "../states/state-machine";
import { handleTerminalOutcome } from "../states/terminal-outcomes";
import { isTerminalState, type ConversationStateId, type ConversationTurn, type StateId } from "../states/types";
import { parseInboundMessage, serializeOutboundMessage } from "./protocol";

const OPENING_TURN: ConversationTurn = {
  role: "user",
  content: "[Call connected. Begin the conversation now.]",
};

const FALLBACK_REPLY = "Sorry, could you say that again?";
const API_ERROR_REPLY =
  "Sorry, I'm having a technical difficulty right now. Someone from our team will follow up with you directly to complete this. Thank you for your time, goodbye.";
const REPEATED_FAILURE_REPLY =
  "Sorry, I'm having trouble understanding. Someone from our team will follow up with you directly to complete this. Thank you for your time, goodbye.";

// A real test call hit repeated Anthropic 529 "Overloaded" errors and, with
// no handling beyond a console.error, went completely silent for minutes
// before the connection eventually dropped -- a genuinely broken customer
// experience on a live call. Any API failure now speaks an apology and
// ends the call cleanly rather than retrying into dead air; a Claude
// response that's merely unparseable (no tool call / illegal transition)
// gets one soft re-prompt, but forces the same clean ending after two in a
// row, rather than looping indefinitely.
const MAX_CONSECUTIVE_SOFT_FAILURES = 2;

const FORCE_END = "FORCE_END" as const;
type RunTurnResult = StateId | typeof FORCE_END;

function send(socket: WebSocket, message: Parameters<typeof serializeOutboundMessage>[0]) {
  socket.send(serializeOutboundMessage(message));
}

function speakAndEnd(socket: WebSocket, text: string, turnHistory: ConversationTurn[], transcript: ConversationTurn[]) {
  turnHistory.push({ role: "assistant", content: text });
  transcript.push({ role: "assistant", content: text });
  send(socket, { type: "text", token: text, last: true });
}

/** Runs one Claude turn, speaks the reply, and records a live ConsentEvent if this turn's transition earned one. Returns the resulting state (may be the same state, a real transition, a terminal state, or FORCE_END on an unrecoverable failure. */
async function runTurn(
  socket: WebSocket,
  currentState: ConversationStateId,
  callSession: CallSession,
  callSid: string,
  turnHistory: ConversationTurn[],
  transcript: ConversationTurn[],
  failureState: { consecutiveFailures: number }
): Promise<RunTurnResult> {
  const turn = await advanceConversationTurn(currentState, { callSession, turnHistory });

  if (!turn.ok) {
    console.error(`[voice-agent] ${turn.reason} in state ${currentState}, call ${callSid}`, "error" in turn ? turn.error : "");

    if (turn.reason === "API_ERROR") {
      speakAndEnd(socket, API_ERROR_REPLY, turnHistory, transcript);
      return FORCE_END;
    }

    failureState.consecutiveFailures += 1;
    if (failureState.consecutiveFailures > MAX_CONSECUTIVE_SOFT_FAILURES) {
      speakAndEnd(socket, REPEATED_FAILURE_REPLY, turnHistory, transcript);
      return FORCE_END;
    }

    turnHistory.push({ role: "assistant", content: FALLBACK_REPLY });
    transcript.push({ role: "assistant", content: FALLBACK_REPLY });
    send(socket, { type: "text", token: FALLBACK_REPLY, last: true });
    return currentState;
  }

  failureState.consecutiveFailures = 0;
  const { replyText, nextState, capturedData } = turn.result;
  turnHistory.push({ role: "assistant", content: replyText });
  transcript.push({ role: "assistant", content: replyText });
  send(socket, { type: "text", token: replyText, last: true });

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

  return nextState;
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
  const failureState = { consecutiveFailures: 0 };

  socket.on("message", (data) => {
    void (async () => {
      const message = parseInboundMessage(data.toString());
      if (!message) {
        console.error(`[voice-agent] unrecognized WS message, closing: ${data.toString().slice(0, 200)}`);
        socket.close();
        return;
      }

      try {
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

          // The opening turn: Claude delivers the greeting with no customer
          // input yet, per the self-transition rule in buildFullSystemPrompt.
          const nextState = await runTurn(socket, currentState, callSession, callSid, turnHistory, transcript, failureState);

          if (nextState === FORCE_END) {
            resolved = true;
            await recordTechnicalFailureOutcome(callSid, transcript);
            send(socket, { type: "end" });
            socket.close();
            return;
          }

          if (!isTerminalState(nextState)) {
            currentState = nextState as ConversationStateId;
          }
          return;
        }

        if (message.type === "prompt") {
          if (!callSession || !callSid) {
            console.error("[voice-agent] prompt received before setup completed, ignoring");
            return;
          }

          turnHistory.push({ role: "user", content: message.voicePrompt });
          transcript.push({ role: "user", content: message.voicePrompt });

          const nextState = await runTurn(socket, currentState, callSession, callSid, turnHistory, transcript, failureState);

          if (nextState === FORCE_END) {
            resolved = true;
            await recordTechnicalFailureOutcome(callSid, transcript);
            send(socket, { type: "end" });
            socket.close();
            return;
          }

          if (isTerminalState(nextState)) {
            resolved = true;
            await handleTerminalOutcome({
              callSession,
              callSid,
              terminalState: nextState,
              transcript,
            });
            send(socket, { type: "end" });
            socket.close();
            return;
          }

          currentState = nextState as ConversationStateId;
          return;
        }

        if (message.type === "interrupt" || message.type === "error") {
          console.log(`[voice-agent] ${message.type} on call ${callSid ?? "unknown"}`);
        }
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
