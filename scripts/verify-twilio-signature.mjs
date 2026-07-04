#!/usr/bin/env node
// Verifies the hand-rolled Twilio request signature algorithm: a correctly
// computed signature is accepted, and tampering with the signature, URL, or
// any form parameter is rejected.

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

const sig = loadTsModule("src/lib/twilio-signature.ts");

const authToken = "test_auth_token_12345";
const url = "https://telecomcompliance.uk/api/v1/voice/verification/abc123/gather";
const formParams = { CallSid: "CA1234567890", Digits: "1", From: "+447700900000" };

const validSignature = sig.computeTwilioSignature({ url, formParams, authToken });

// --- Valid signature is accepted -----------------------------------------
assert.equal(
  sig.verifyTwilioSignature({ url, formParams, authToken, signature: validSignature }),
  true,
  "a correctly computed signature must verify"
);

// --- Tampered signature is rejected ---------------------------------------
assert.equal(
  sig.verifyTwilioSignature({
    url,
    formParams,
    authToken,
    signature: validSignature.slice(0, -1) + (validSignature.endsWith("A") ? "B" : "A"),
  }),
  false,
  "a tampered signature must be rejected"
);

// --- Tampered URL is rejected ----------------------------------------------
assert.equal(
  sig.verifyTwilioSignature({
    url: url + "/tampered",
    formParams,
    authToken,
    signature: validSignature,
  }),
  false,
  "a signature computed for a different URL must be rejected"
);

// --- Tampered parameter is rejected -----------------------------------------
assert.equal(
  sig.verifyTwilioSignature({
    url,
    formParams: { ...formParams, Digits: "2" },
    authToken,
    signature: validSignature,
  }),
  false,
  "a signature computed for different form parameters must be rejected"
);

// --- Wrong auth token is rejected --------------------------------------------
assert.equal(
  sig.verifyTwilioSignature({
    url,
    formParams,
    authToken: "wrong_token",
    signature: validSignature,
  }),
  false,
  "a signature verified with the wrong auth token must be rejected"
);

// --- parseTwilioFormBody parses standard form-encoded bodies -----------------
const parsed = sig.parseTwilioFormBody("CallSid=CA123&Digits=1&From=%2B447700900000");
assert.equal(parsed.CallSid, "CA123");
assert.equal(parsed.Digits, "1");
assert.equal(parsed.From, "+447700900000");

console.log("Twilio signature verification passed.");
