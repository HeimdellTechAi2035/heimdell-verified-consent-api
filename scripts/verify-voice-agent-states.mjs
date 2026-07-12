#!/usr/bin/env node
// Verifies the conversational voice agent's state-machine data in
// isolation: no live Claude call, no database, no API key needed. Only
// exercises voice-agent-service/src/states/{types,definitions}.ts, both of
// which have exclusively type-only imports (erased by ts.transpileModule),
// so this can run as a plain standalone script like the other verify-*.mjs
// scripts in this repo.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path) {
  const source = readFileSync(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const execute = new Function("require", "module", "exports", transpiled);
  execute(require, module, module.exports);
  return module.exports;
}

const { CONVERSATION_STATE_IDS, TERMINAL_STATE_IDS, isTerminalState } = loadTsModule(
  "voice-agent-service/src/states/types.ts"
);
const { STATE_DEFINITIONS } = loadTsModule("voice-agent-service/src/states/definitions.ts");

const ALL_STATE_IDS = new Set([...CONVERSATION_STATE_IDS, ...TERMINAL_STATE_IDS]);

function legalTransitionsFor(definition) {
  return [definition.id, definition.positiveTransition, ...definition.otherTransitions];
}

// Every conversation state has a definition, and every transition it names
// (itself, its positive path, its branches) is a real, known state id --
// catches typos in definitions.ts that would otherwise only surface live,
// mid-call, when Claude picks a transition nothing recognizes.
for (const stateId of CONVERSATION_STATE_IDS) {
  const definition = STATE_DEFINITIONS[stateId];
  assert.ok(definition, `Missing StateDefinition for ${stateId}`);
  assert.equal(definition.id, stateId, `StateDefinition.id mismatch for ${stateId}`);

  for (const transition of legalTransitionsFor(definition)) {
    assert.ok(
      ALL_STATE_IDS.has(transition),
      `${stateId} names an unknown transition target: ${transition}`
    );
  }

  assert.ok(
    typeof definition.buildSystemPrompt === "function",
    `${stateId} is missing buildSystemPrompt`
  );
}

// isTerminalState classifies every id correctly, in both directions.
for (const stateId of TERMINAL_STATE_IDS) {
  assert.equal(isTerminalState(stateId), true, `${stateId} should be terminal`);
}
for (const stateId of CONVERSATION_STATE_IDS) {
  assert.equal(isTerminalState(stateId), false, `${stateId} should not be terminal`);
}

// Illegal-transition rejection: a state must never be able to "jump" to a
// terminal state that isn't one of its own declared branches (e.g.
// IDENTITY_CHECK jumping straight to COMPLETED).
const identityCheck = STATE_DEFINITIONS.IDENTITY_CHECK;
const identityLegalTransitions = legalTransitionsFor(identityCheck);
assert.ok(
  !identityLegalTransitions.includes("COMPLETED"),
  "IDENTITY_CHECK must not be able to transition straight to COMPLETED"
);
assert.ok(
  identityLegalTransitions.includes("WRONG_NUMBER"),
  "IDENTITY_CHECK must be able to transition to WRONG_NUMBER"
);

// Every conversation state's positiveTransition is itself a real state
// (conversation or terminal), and is never the state's own id (a
// "successful" transition must always actually move the conversation).
for (const stateId of CONVERSATION_STATE_IDS) {
  const definition = STATE_DEFINITIONS[stateId];
  assert.notEqual(
    definition.positiveTransition,
    stateId,
    `${stateId}'s positiveTransition must differ from its own id`
  );
}

// The happy path chains all the way to COMPLETED: IDENTITY_CHECK's
// positiveTransition eventually leads to EXPLICIT_AGREEMENT's, which must
// be COMPLETED.
let cursor = "IDENTITY_CHECK";
const visited = [];
while (!isTerminalState(cursor)) {
  visited.push(cursor);
  assert.ok(!visited.slice(0, -1).includes(cursor), `Happy-path cycle detected at ${cursor}`);
  cursor = STATE_DEFINITIONS[cursor].positiveTransition;
}
assert.equal(cursor, "COMPLETED", `Happy path must end at COMPLETED, ended at ${cursor}`);
assert.deepEqual(
  visited,
  [
    "IDENTITY_CHECK",
    "SIGNUP_CONFIRMATION",
    "NAME_ADDRESS",
    "PRODUCT_CONFIRMATION",
    "TERMS_UNDERSTANDING",
    "POLICY_FAQ",
    "DIRECT_DEBIT",
    "EXPLICIT_AGREEMENT",
  ],
  "Happy path did not visit the expected 8 states in order"
);

// The 6 decline-eligible terminal states (everything except COMPLETED and
// WRONG_NUMBER) is exactly what terminal-outcomes.ts expects to handle --
// if a new terminal state is ever added without updating that dispatch
// table, this catches the gap here rather than live, mid-call.
const declineEligible = TERMINAL_STATE_IDS.filter((id) => id !== "COMPLETED" && id !== "WRONG_NUMBER");
assert.deepEqual(
  declineEligible.sort(),
  [
    "AGREEMENT_REFUSED",
    "DD_MISMATCH_FOLLOWUP",
    "OBJECTION_FOLLOWUP",
    "SIGNUP_UNCONFIRMED_FOLLOWUP",
    "STOP_REQUESTED",
    "TERMS_NOT_UNDERSTOOD_FOLLOWUP",
  ].sort(),
  "Decline-eligible terminal state set changed -- update terminal-outcomes.ts's DECLINE_REASONS/OUTCOME_CODES to match"
);

// Every state with a consentEventOnSuccess only records it on the positive
// path (enforced by construction in state-machine.ts, but worth pinning the
// intended set here so a future edit can't silently drop one).
const statesWithConsentEvents = CONVERSATION_STATE_IDS.filter(
  (id) => STATE_DEFINITIONS[id].consentEventOnSuccess
);
assert.deepEqual(
  statesWithConsentEvents.sort(),
  [
    "NAME_ADDRESS",
    "PRODUCT_CONFIRMATION",
    "TERMS_UNDERSTANDING",
    "POLICY_FAQ",
    "DIRECT_DEBIT",
    "EXPLICIT_AGREEMENT",
  ].sort(),
  "Set of states that record a live ConsentEvent has changed"
);

console.log("Voice agent state machine verification passed.");
