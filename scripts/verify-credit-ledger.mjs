#!/usr/bin/env node
// Verifies credit-ledger charge/credit logic against a fake Prisma
// transaction client. Race-safety itself comes from the atomic SQL
// `UPDATE ... WHERE balance >= cost` pattern, which is a Postgres guarantee,
// not something a JS-level unit test can prove -- this test verifies the
// application-level logic correctly interprets that result (aborts on
// count !== 1, never creates a ledger row without a successful deduction).

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

const ledger = loadTsModule("src/lib/credit-ledger.ts");

// --- Fake Prisma transaction client -----------------------------------
function makeFakeTx(initialBalance) {
  let balance = initialBalance;
  const ledgerEntries = [];

  return {
    state: () => ({ balance, ledgerEntries }),
    creditBalance: {
      updateMany: async ({ where, data }) => {
        const meetsCondition = balance >= where.balance.gte;
        if (!meetsCondition) {
          return { count: 0 };
        }
        balance -= data.balance.decrement;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ balance }),
      upsert: async ({ create, update }) => {
        if (balance === undefined) {
          balance = create.balance;
        } else {
          balance += update.balance.increment;
        }
        return { balance };
      },
    },
    creditLedgerEntry: {
      create: async ({ data }) => {
        ledgerEntries.push(data);
        return data;
      },
    },
  };
}

// --- Test 1: sufficient balance charges successfully -------------------
{
  const tx = makeFakeTx(10);
  await ledger.chargeCreditsForVerification(tx, {
    organizationId: "org_1",
    cost: 5,
    saleId: "sale_1",
    verificationSessionId: "session_1",
  });

  const { balance, ledgerEntries } = tx.state();
  assert.equal(balance, 5, "balance should decrement by the charged amount");
  assert.equal(ledgerEntries.length, 1, "exactly one ledger row should be written");
  assert.equal(ledgerEntries[0].type, "VERIFICATION_CHARGE");
  assert.equal(ledgerEntries[0].amount, -5, "ledger amount must be negative for a charge");
  assert.equal(ledgerEntries[0].balanceAfter, 5);
  assert.equal(ledgerEntries[0].relatedSaleId, "sale_1");
  assert.equal(ledgerEntries[0].relatedVerificationSessionId, "session_1");
}

// --- Test 2: insufficient balance throws and writes nothing -------------
{
  const tx = makeFakeTx(3);
  await assert.rejects(
    () =>
      ledger.chargeCreditsForVerification(tx, {
        organizationId: "org_2",
        cost: 5,
        saleId: "sale_2",
        verificationSessionId: "session_2",
      }),
    (err) => err instanceof ledger.InsufficientCreditsError,
    "should throw InsufficientCreditsError when balance can't cover the cost"
  );

  const { balance, ledgerEntries } = tx.state();
  assert.equal(balance, 3, "balance must be untouched when the charge fails");
  assert.equal(ledgerEntries.length, 0, "no ledger row should be written on a failed charge");
}

// --- Test 3: exact-balance charge succeeds (boundary, not off-by-one) ---
{
  const tx = makeFakeTx(5);
  await ledger.chargeCreditsForVerification(tx, {
    organizationId: "org_3",
    cost: 5,
    saleId: "sale_3",
    verificationSessionId: "session_3",
  });
  assert.equal(tx.state().balance, 0, "charging the exact balance should succeed and leave zero");
}

// --- Test 4: creditOrganizationBalance credits a purchase ---------------
{
  const tx = makeFakeTx(0);
  await ledger.creditOrganizationBalance(tx, {
    organizationId: "org_4",
    amount: 100,
    type: "PURCHASE",
    relatedStripePaymentIntentId: "pi_test_123",
  });

  const { balance, ledgerEntries } = tx.state();
  assert.equal(balance, 100);
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0].type, "PURCHASE");
  assert.equal(ledgerEntries[0].amount, 100);
  assert.equal(ledgerEntries[0].relatedStripePaymentIntentId, "pi_test_123");
}

console.log("Credit ledger verification passed.");
