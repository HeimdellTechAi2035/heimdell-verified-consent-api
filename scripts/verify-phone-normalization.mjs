#!/usr/bin/env node
// Verifies phone number normalization to E.164 -- Twilio rejects anything
// else, and this was the cause of a real bug (a UK customer phone typed as
// "07418008279" never actually dialed).

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

const { normalizePhoneToE164 } = loadTsModule("src/lib/phone-number.ts");

assert.equal(normalizePhoneToE164("07418008279"), "+447418008279");
assert.equal(normalizePhoneToE164("+447418008279"), "+447418008279");
assert.equal(normalizePhoneToE164("447418008279"), "+447418008279");
assert.equal(normalizePhoneToE164("7418008279"), "+447418008279");
assert.equal(normalizePhoneToE164("07418 008 279"), "+447418008279");
assert.equal(normalizePhoneToE164("+1 415 555 0100"), "+14155550100");
assert.equal(normalizePhoneToE164(""), null);
assert.equal(normalizePhoneToE164("123"), null);
assert.equal(normalizePhoneToE164("   "), null);

console.log("Phone normalization verification passed.");
