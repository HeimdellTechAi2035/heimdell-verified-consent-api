#!/usr/bin/env node
// Runs one finite batch of queued outbound webhook deliveries.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

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

function readArgs(argv) {
  const args = {
    dryRun: argv.includes("--dry-run"),
    limit: 10,
  };

  const limitIndex = argv.indexOf("--limit");
  if (limitIndex >= 0 && argv[limitIndex + 1]) {
    const parsed = Number.parseInt(argv[limitIndex + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      args.limit = parsed;
    }
  }

  return args;
}

const args = readArgs(process.argv.slice(2));
const db = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

const webhooks = loadTsModule("src/lib/webhooks.ts", {
  "@/lib/db": { db },
});
const delivery = loadTsModule("src/lib/webhook-delivery.ts", {
  "@/lib/db": { db },
  "@/lib/webhooks": webhooks,
});

try {
  const result = await delivery.processWebhookDeliveries({
    dbClient: db,
    limit: args.limit,
    dryRun: args.dryRun,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: args.dryRun ? "dry_run" : "delivery",
        scanned: result.scanned,
        sent: result.sent,
        failed: result.failed,
        retry_scheduled: result.retryScheduled,
        terminal_failed: result.terminalFailed,
        dry_run: result.dryRun,
      },
      null,
      2
    )
  );

  if (result.failed > 0 && !args.dryRun) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("[webhook-worker] failed to process webhook batch");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
