#!/usr/bin/env node
// Minimal verification for src/lib/crypto.ts.
// This script does not read .env.local or print secret values.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadCryptoModule() {
  const source = readFileSync("src/lib/crypto.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const exports = module.exports;
  const localRequire = (specifier) => {
    if (specifier === "nanoid") {
      return { nanoid: () => randomBytes(16).toString("hex") };
    }
    return require(specifier);
  };

  const execute = new Function(
    "require",
    "module",
    "exports",
    transpiled
  );
  execute(localRequire, module, exports);

  return module.exports;
}

const {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskAccountNumber,
  maskSortCode,
  parseEncryptionKey,
} = loadCryptoModule();

const originalKey = process.env.ENCRYPTION_KEY;

try {
  const testKey = randomBytes(32).toString("base64");
  const plaintext = "12345678";

  process.env.ENCRYPTION_KEY = testKey;
  const encrypted = encryptSensitiveValue(plaintext);

  assert.notEqual(encrypted, plaintext);
  assert.match(encrypted, /^v1:[^:]+:[^:]+:[^:]+$/u);
  assert.equal(decryptSensitiveValue(encrypted), plaintext);
  assert.throws(() => parseEncryptionKey(undefined));
  assert.throws(() => parseEncryptionKey("not-a-valid-32-byte-key"));
  assert.throws(() => parseEncryptionKey(randomBytes(16).toString("base64")));
  assert.equal(maskAccountNumber("12345678"), "****5678");
  assert.notEqual(maskAccountNumber("12345678"), "12345678");
  assert.equal(maskSortCode("12-34-56"), "**-**-56");
  assert.notEqual(maskSortCode("12-34-56"), "12-34-56");

  console.log("Crypto verification passed.");
} finally {
  if (originalKey === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = originalKey;
  }
}
