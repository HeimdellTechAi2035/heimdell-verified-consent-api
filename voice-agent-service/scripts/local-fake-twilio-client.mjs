#!/usr/bin/env node
// Drives a scripted happy-path conversation against a REAL running
// voice-agent-service (local `npm run dev` or a deployed instance) over a
// real WebSocket, using a REAL Claude call and a REAL seeded verification
// session -- there is no point mocking Claude here, since the whole thing
// being tested is whether the actual conversation makes sense end to end.
//
// This intentionally does NOT create the test Sale/DirectDebitMandate/
// VerificationSession itself -- create a real one first the same way a
// seller would (dashboard -> New Verification, method "phone_call"), then
// grab its plaintext token. Since the token is only ever stored hashed,
// the easiest source is the verification URL Heimdell sends out (its path
// segment is the raw token) or a one-off `db.verificationSession` query
// against a session you just created, before any real call consumes it.
//
// Usage:
//   node scripts/local-fake-twilio-client.mjs --ws-url ws://localhost:8080 --token <raw-token>
//
// Prints every line the agent would speak and waits a moment between turns
// so a human can read along -- this is a manual-review tool, not an
// automated assertion suite (Claude's exact wording isn't deterministic,
// so string-matching its replies would be brittle rather than meaningful).

import WebSocket from "ws";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { wsUrl: "ws://localhost:8080", token: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--ws-url") out.wsUrl = args[++i];
    if (args[i] === "--token") out.token = args[++i];
  }
  return out;
}

const HAPPY_PATH_UTTERANCES = [
  "Yes, that's me.",
  "Yes, I did sign up for that.",
  "Yes, that's all correct.",
  "Yep, that's right.",
  "Yes, I understand.",
  "No questions, I'm happy to continue.",
  "Yes, that's my bank. Yes, that sort code is right. The last two digits are the ones on file.",
  "Yes, I agree.",
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { wsUrl, token } = parseArgs();
  if (!token) {
    console.error("Usage: node scripts/local-fake-twilio-client.mjs --ws-url ws://host:port --token <raw-token>");
    process.exit(1);
  }

  const url = `${wsUrl.replace(/\/$/, "")}/call/${token}`;
  console.log(`Connecting to ${url} ...`);
  const socket = new WebSocket(url);

  let utteranceIndex = 0;
  let ended = false;

  socket.on("open", () => {
    console.log("Connected. Sending setup...");
    socket.send(JSON.stringify({ type: "setup", callSid: "CA_fake_local_test" }));
  });

  socket.on("message", async (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.type === "text") {
      console.log(`\n🤖 AGENT: ${message.token}`);

      if (utteranceIndex < HAPPY_PATH_UTTERANCES.length) {
        const nextUtterance = HAPPY_PATH_UTTERANCES[utteranceIndex];
        utteranceIndex += 1;
        await wait(500);
        console.log(`👤 CUSTOMER: ${nextUtterance}`);
        socket.send(JSON.stringify({ type: "prompt", voicePrompt: nextUtterance, last: true }));
      } else {
        console.log("\n(Ran out of scripted utterances -- waiting for the agent to end the call.)");
      }
      return;
    }

    if (message.type === "end") {
      ended = true;
      console.log("\n✅ Agent sent end-of-call. Closing.");
      socket.close();
    }
  });

  socket.on("close", () => {
    console.log(ended ? "Call ended normally." : "Connection closed (did not reach an end message).");
    process.exit(ended ? 0 : 1);
  });

  socket.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    process.exit(1);
  });
}

main();
