#!/usr/bin/env node
// Verifies voice-agent-service/src/corrections.ts's validation/apply logic
// in isolation, against a fake in-memory db -- no live database, no
// Anthropic API key, no Twilio call needed. Mirrors the ts.transpileModule
// + mock-injection pattern used by the other verify-*.mjs scripts that
// exercise TypeScript modules outside the Next.js/voice-agent-service build.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path, mocks = {}) {
  const source = readFileSync(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const localRequire = (specifier) => mocks[specifier] ?? require(specifier);
  const execute = new Function("require", "module", "exports", transpiled);
  execute(localRequire, module, module.exports);
  return module.exports;
}

function makeFakeDb() {
  const calls = { saleUpdates: [], mandateUpdates: [], consentEvents: [] };
  const sales = new Map();

  return {
    calls,
    seedSale(id, reviewFlags) {
      sales.set(id, { reviewFlags: reviewFlags ?? null });
    },
    db: {
      sale: {
        async update({ where, data }) {
          calls.saleUpdates.push({ where, data });
          const existing = sales.get(where.id) ?? { reviewFlags: null };
          sales.set(where.id, { ...existing, ...data });
        },
        async findUniqueOrThrow({ where }) {
          const existing = sales.get(where.id);
          if (!existing) throw new Error(`no fake sale ${where.id}`);
          return { reviewFlags: existing.reviewFlags };
        },
      },
      directDebitMandate: {
        async update({ where, data }) {
          calls.mandateUpdates.push({ where, data });
        },
      },
      consentEvent: {
        async create({ data }) {
          calls.consentEvents.push(data);
        },
      },
    },
  };
}

async function run() {
  // --- Test 1: a valid sortCode correction is applied and flagged ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-1", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-1",
      directDebitMandateId: "mandate-1",
      verificationSessionId: "vs-1",
      state: "DIRECT_DEBIT",
      field: "sortCode",
      oldValue: "601949",
      rawNewValue: "61-19-49",
    });

    assert.equal(fake.calls.mandateUpdates.length, 1, "sortCode correction should update DirectDebitMandate");
    assert.deepEqual(fake.calls.mandateUpdates[0], {
      where: { id: "mandate-1" },
      data: { sortCode: "611949" },
    });
    assert.equal(fake.calls.consentEvents.length, 1, "should always write a DATA_CORRECTED_ON_CALL event");
    assert.equal(fake.calls.consentEvents[0].eventType, "DATA_CORRECTED_ON_CALL");
    assert.equal(fake.calls.consentEvents[0].eventPayload.applied, true);
    assert.equal(fake.calls.consentEvents[0].eventPayload.newValue, "611949");
    assert.equal(fake.calls.saleUpdates.at(-1).data.needsReview, true, "needsReview must be set");
  }

  // --- Test 2: an invalid sortCode (not 6 digits) is NOT applied, but still flagged ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-2", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-2",
      directDebitMandateId: "mandate-2",
      verificationSessionId: "vs-2",
      state: "DIRECT_DEBIT",
      field: "sortCode",
      oldValue: "601949",
      rawNewValue: "not a sort code",
    });

    assert.equal(fake.calls.mandateUpdates.length, 0, "malformed sortCode must never be written");
    assert.equal(fake.calls.consentEvents.length, 1, "malformed correction is still recorded for staff");
    assert.equal(fake.calls.consentEvents[0].eventPayload.applied, false);
    assert.equal(fake.calls.saleUpdates.at(-1).data.needsReview, true);
  }

  // --- Test 2b: a valid customerEmail correction is applied and lowercased ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-2b", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-2b",
      directDebitMandateId: null,
      verificationSessionId: "vs-2b",
      state: "NAME_ADDRESS",
      field: "customerEmail",
      oldValue: "old@example.com",
      rawNewValue: "New.Name@Example.com",
    });

    assert.equal(fake.calls.saleUpdates.filter((u) => u.data.customerEmail).length, 1, "valid email should be written");
    assert.equal(fake.calls.saleUpdates.find((u) => u.data.customerEmail).data.customerEmail, "new.name@example.com");
    assert.equal(fake.calls.consentEvents[0].eventPayload.applied, true);
  }

  // --- Test 2c: a malformed customerEmail is not applied, but still flagged ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-2c", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-2c",
      directDebitMandateId: null,
      verificationSessionId: "vs-2c",
      state: "NAME_ADDRESS",
      field: "customerEmail",
      oldValue: "old@example.com",
      rawNewValue: "not an email",
    });

    assert.equal(fake.calls.saleUpdates.filter((u) => u.data.customerEmail).length, 0, "malformed email must never be written");
    assert.equal(fake.calls.consentEvents[0].eventPayload.applied, false);
  }

  // --- Test 3: accountNumberLast4 is flag-only -- never written anywhere ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-3", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-3",
      directDebitMandateId: "mandate-3",
      verificationSessionId: "vs-3",
      state: "DIRECT_DEBIT",
      field: "accountNumberLast4",
      oldValue: "78",
      rawNewValue: "12345678",
    });

    assert.equal(fake.calls.mandateUpdates.length, 0, "account number must never be auto-written");
    assert.equal(fake.calls.consentEvents[0].eventPayload.applied, false);
    assert.equal(fake.calls.consentEvents[0].eventPayload.newValue, "12345678", "raw stated value is still recorded for staff");
  }

  // --- Test 4: a bankName correction with no mandate on file is not applied ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-4", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-4",
      directDebitMandateId: null,
      verificationSessionId: "vs-4",
      state: "DIRECT_DEBIT",
      field: "bankName",
      oldValue: "Old Bank",
      rawNewValue: "New Bank",
    });

    assert.equal(fake.calls.mandateUpdates.length, 0, "no mandate id -- nothing to update");
    assert.equal(fake.calls.consentEvents[0].eventPayload.applied, false);
  }

  // --- Test 5: reviewFlags accumulate across multiple corrections on the same sale ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-5", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    await corrections.captureCorrection({
      saleId: "sale-5",
      directDebitMandateId: "mandate-5",
      verificationSessionId: "vs-5",
      state: "NAME_ADDRESS",
      field: "customerName",
      oldValue: "Jon",
      rawNewValue: "John",
    });
    await corrections.captureCorrection({
      saleId: "sale-5",
      directDebitMandateId: "mandate-5",
      verificationSessionId: "vs-5",
      state: "DIRECT_DEBIT",
      field: "bankName",
      oldValue: "Old Bank",
      rawNewValue: "New Bank",
    });

    const finalFlags = fake.calls.saleUpdates.at(-1).data.reviewFlags;
    assert.equal(finalFlags.length, 2, "reviewFlags must accumulate, not overwrite");
    assert.equal(finalFlags[0].field, "customerName");
    assert.equal(finalFlags[1].field, "bankName");
  }

  // --- Test 6: applyCapturedCorrections extracts { corrections: [...] }, applies only well-formed entries, and flags malformed ones instead of silently dropping them ---
  {
    const fake = makeFakeDb();
    fake.seedSale("sale-6", null);
    const corrections = loadTsModule("voice-agent-service/src/corrections.ts", {
      "@/lib/db": { db: fake.db },
    });

    const callSession = {
      sale: {
        id: "sale-6",
        customerName: "Jane",
        customerAddress: "1 Road",
        productName: "Broadband",
        productFrequency: "monthly",
        productPrice: { toString: () => "29.99" },
        directDebitMandate: { id: "mandate-6", bankName: "Bank A", sortCode: "111111", accountNumberLast4: "34" },
      },
      verificationSession: { id: "vs-6" },
    };

    // No corrections -> no-op, zero calls.
    await corrections.applyCapturedCorrections(callSession, "NAME_ADDRESS", undefined);
    assert.equal(fake.calls.consentEvents.length, 0, "no corrections in captured_data must be a no-op");

    // Malformed entries must not be APPLIED, but must not silently vanish
    // either -- previously they were dropped with zero trace anywhere,
    // defeating the "always flag it, even if it didn't validate"
    // guarantee the rest of this file makes.
    await corrections.applyCapturedCorrections(callSession, "NAME_ADDRESS", {
      corrections: [
        { field: "notARealField", value: "x" },
        { field: "customerName" }, // missing value
        { field: "customerName", value: "Jane Smith" },
      ],
    });
    assert.equal(fake.calls.saleUpdates.filter((u) => u.data.customerName).length, 1, "only the well-formed entry should be applied");
    // One event for the well-formed correction, plus one catch-all event
    // recording that malformed entries were dropped this turn.
    assert.equal(fake.calls.consentEvents.length, 2, "malformed entries must still be flagged, not silently vanish");
    const malformedFlagEvent = fake.calls.consentEvents.find((e) => e.eventPayload.field === "unknown");
    assert.ok(malformedFlagEvent, "a catch-all event must exist for the dropped malformed entries");
    assert.equal(malformedFlagEvent.eventPayload.applied, false);
    assert.equal(fake.calls.saleUpdates.filter((u) => u.data.needsReview === true).length >= 2, true, "both the valid correction and the malformed-entry flag must mark needsReview");
  }

  console.log("Voice agent corrections verification passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
