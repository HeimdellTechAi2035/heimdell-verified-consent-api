#!/usr/bin/env node
// Verifies the TwiML builder: the gather prompt has the required attributes
// (numDigits, actionOnEmptyResult, action URL), the disclosure script stays
// outside any <Gather> (no DTMF barge-in before the customer hears
// everything), long policy text is chunked into multiple <Say> tags, and
// customer/product names containing XML-special characters come out
// escaped.

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

const twiml = loadTsModule("src/lib/voice-twiml.ts");

const baseData = {
  customerName: "Jane Smith",
  productName: "Premium Broadband",
  subscriptionPrice: "£49.99",
  subscriptionFrequency: "monthly",
  termsSummary: "24-month contract",
  policiesSummary: "Standard fair use policy applies",
  termsAndConditions: "You are agreeing to the product, price, and contract length shown.",
  coolingOffPolicy: "You have a 14-day cooling-off period.",
  cancellationInstructions: "To cancel, contact support.",
  directDebitGuaranteeWording: "The Direct Debit Guarantee protects you.",
  gatherActionUrl: "https://telecomcompliance.uk/api/v1/voice/verification/abc123/gather",
};

// --- Gather has the required attributes -----------------------------------
{
  const xml = twiml.buildVerificationScriptTwiml(baseData);
  assert.ok(xml.includes('numDigits="1"'), "gather must request exactly 1 digit");
  assert.ok(
    xml.includes('actionOnEmptyResult="true"'),
    "actionOnEmptyResult must be true, or Twilio never calls the action URL on timeout"
  );
  assert.ok(
    xml.includes(`action="${baseData.gatherActionUrl}"`),
    "gather action must point at the exact gather webhook URL"
  );
  assert.ok(xml.includes("<Gather"), "must contain a Gather verb");
  assert.ok(xml.includes("</Response>"), "must be a well-formed Response document");
}

// --- Disclosure script stays outside the Gather (no DTMF barge-in) --------
{
  const xml = twiml.buildVerificationScriptTwiml(baseData);
  const gatherIndex = xml.indexOf("<Gather");
  const termsIndex = xml.indexOf(baseData.termsAndConditions);
  const coolingOffIndex = xml.indexOf(baseData.coolingOffPolicy);

  assert.ok(termsIndex !== -1 && termsIndex < gatherIndex, "terms must be said before the Gather");
  assert.ok(
    coolingOffIndex !== -1 && coolingOffIndex < gatherIndex,
    "cooling-off policy must be said before the Gather"
  );
}

// --- Long policy text is chunked into multiple <Say> tags -----------------
{
  const longText = "Term. ".repeat(400); // well over the 1400-char chunk threshold
  const chunks = twiml.chunkTextForSay(longText);
  assert.ok(chunks.length > 1, "text over the chunk threshold must split into multiple chunks");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 1500, "no individual chunk should be unreasonably long");
  }

  const xml = twiml.buildVerificationScriptTwiml({ ...baseData, termsAndConditions: longText });
  const sayCount = (xml.match(/<Say>/g) ?? []).length;
  assert.ok(sayCount > 5, "long terms text should produce multiple <Say> tags, not one giant one");
}

// --- XML-special characters in names come out escaped ----------------------
{
  const xml = twiml.buildVerificationScriptTwiml({
    ...baseData,
    customerName: `O'Brien & Sons <Ltd>`,
  });
  assert.ok(!xml.includes(`O'Brien & Sons <Ltd>`), "raw unescaped name must not appear in the XML");
  assert.ok(xml.includes("O&apos;Brien &amp; Sons &lt;Ltd&gt;"), "name must be XML-escaped");
}

// --- escapeXml covers all five special characters --------------------------
{
  assert.equal(twiml.escapeXml(`& < > " '`), "&amp; &lt; &gt; &quot; &apos;");
}

// --- Reprompt / completed / declined / no-response / already-resolved ------
{
  const reprompt = twiml.buildRepromptTwiml(baseData.gatherActionUrl + "?attempt=2");
  assert.ok(reprompt.includes(`action="${baseData.gatherActionUrl}?attempt=2"`));
  assert.ok(reprompt.includes("<Gather"));

  assert.ok(twiml.buildCompletedTwiml().includes("<Hangup/>"));
  assert.ok(twiml.buildDeclinedTwiml().includes("<Hangup/>"));

  const noResponse = twiml.buildNoResponseTwiml();
  assert.ok(noResponse.includes("<Hangup/>"));
  assert.ok(!noResponse.includes("<Gather"), "no-response script must not re-prompt a third time");

  const expired = twiml.buildAlreadyResolvedTwiml("EXPIRED");
  assert.ok(expired.toLowerCase().includes("expired"));
  const alreadyDone = twiml.buildAlreadyResolvedTwiml("ALREADY_COMPLETED");
  assert.ok(alreadyDone.includes("<Hangup/>"));
}

// --- ConversationRelay welcome greeting can't be barged into by a reflexive "hello" ---
{
  const xml = twiml.buildConversationRelayTwiml({
    wsUrl: "wss://voice.example.com/call/abc123",
    welcomeGreeting: "Hello, this is a call on behalf of Acme.",
  });
  assert.ok(xml.includes('welcomeGreetingInterruptible="none"'), "welcome greeting must not be interruptible, or a caller's reflexive \"hello\" would cut off the intro before it says who's calling and why");
  assert.ok(xml.includes('welcomeGreeting="Hello, this is a call on behalf of Acme."'));

  const withoutGreeting = twiml.buildConversationRelayTwiml({ wsUrl: "wss://voice.example.com/call/abc123" });
  assert.ok(!withoutGreeting.includes("welcomeGreeting"), "no greeting attribute should be emitted when none is given");
}

// --- buildIdentityGreetingText: the exact opening line, word for word ---
{
  const greeting = twiml.buildIdentityGreetingText("Jane Smith", "Premium Broadband", "Acme Telecom");
  assert.ok(greeting.includes("This call is being recorded"), "must disclose recording");
  assert.ok(greeting.includes("Acme Telecom"), "must say who is calling");
  assert.ok(greeting.includes("Premium Broadband"), "must say what it's about");
  assert.ok(greeting.includes("Is that Jane Smith?"), "must end by asking for the customer by name");
  // "who's calling and why" must come BEFORE the "is that <name>" question --
  // this is the specific ordering fix from a real call where the agent
  // asked for the customer by name before ever saying who was calling.
  assert.ok(greeting.indexOf("Acme Telecom") < greeting.indexOf("Is that Jane Smith?"));
}

// --- buildPolicyDisclosureText: the deterministic POLICY_FAQ injection content ---
// This is the exact text ws-handler.ts appends by code at the moment of
// transition into POLICY_FAQ (see the "policyDisclosure" logic in
// runChainedTurns) -- Claude reading it itself was unreliable on a real
// call, so this content is generated here instead and just spoken
// verbatim. Pinning its exact behavior here is the only automated
// coverage that would catch a regression to that fix.
{
  const withSellerPolicies = twiml.buildPolicyDisclosureText(
    "No refunds after 14 days.",
    "The Direct Debit Guarantee protects you."
  );
  assert.equal(withSellerPolicies, "No refunds after 14 days. The Direct Debit Guarantee protects you.");

  const withoutSellerPolicies = twiml.buildPolicyDisclosureText(null, "The Direct Debit Guarantee protects you.");
  assert.equal(withoutSellerPolicies, "The Direct Debit Guarantee protects you.", "must fall back to just the DD guarantee wording when the seller left policies blank");

  const blankSellerPolicies = twiml.buildPolicyDisclosureText("   ", "The Direct Debit Guarantee protects you.");
  assert.equal(blankSellerPolicies, "The Direct Debit Guarantee protects you.", "whitespace-only seller policies must be treated the same as null, not spoken as an empty sentence");
}

console.log("Voice TwiML verification passed.");
