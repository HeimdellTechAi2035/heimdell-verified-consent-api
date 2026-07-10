#!/usr/bin/env node
// Runs every static verify-*.mjs script in scripts/ and reports a pass/fail
// summary. Used by CI and by `npm run test:all` locally. Deliberately
// excludes scripts that need a live server or real provider credentials
// (test:health, test:demo-e2e, test:webhook-live-proof's local receiver is
// self-contained so that one stays in).

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const EXCLUDED = new Set([
  "webhook-test-receiver.mjs", // not a test -- a long-running local receiver process
]);

const scriptFiles = readdirSync("scripts")
  .filter((name) => name.startsWith("verify-") && name.endsWith(".mjs"))
  .filter((name) => !EXCLUDED.has(name))
  .sort();

const results = [];

for (const file of scriptFiles) {
  process.stdout.write(`\n=== ${file} ===\n`);
  const result = spawnSync(process.execPath, [`scripts/${file}`], {
    stdio: "inherit",
  });
  results.push({ file, ok: result.status === 0 });
}

const failed = results.filter((r) => !r.ok);

console.log("\n----------------------------------------");
console.log(`${results.length - failed.length}/${results.length} verify scripts passed`);

if (failed.length > 0) {
  console.log("Failed:");
  for (const r of failed) {
    console.log(`  - ${r.file}`);
  }
  process.exit(1);
}
