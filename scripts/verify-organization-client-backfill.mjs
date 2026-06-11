#!/usr/bin/env node
// Verifies organization Client backfill is idempotent and secret-safe by static inspection.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/backfill-organization-clients.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const provisioningSource = readFileSync(
  "src/lib/dashboard-client-provisioning.ts",
  "utf8"
);
const apiKeyFormSource = readFileSync(
  "src/components/dashboard/ApiKeyCreateForm.tsx",
  "utf8"
);

assert.equal(
  packageJson.scripts["backfill:organization-clients"],
  "node scripts/backfill-organization-clients.mjs"
);

assert.match(source, /organization\.clients\.length > 0/);
assert.match(source, /skippedCount \+= 1/);
assert.match(source, /prisma\.client\.create/);
assert.match(source, /organizationId: organization\.id/);
assert.match(source, /name: `\$\{organization\.name\} Client`/);
assert.match(source, /apiKeyHash: await createPlaceholderHash\(\)/);
assert.match(source, /Test Telecom Ltd/);
assert.match(source, /Client status: present/);
assert.match(source, /Created Client rows/);
assert.match(source, /Skipped organizations with existing Client rows/);
assert.doesNotMatch(source, /console\.log\(.*apiKeyHash/s);
assert.doesNotMatch(source, /console\.log\(.*generatePlaceholderSecret/s);
assert.doesNotMatch(source, /console\.log\(.*placeholder.*secret/is);

assert.match(provisioningSource, /tx\.client\.create/);
assert.match(provisioningSource, /organizationId: organization\.id/);
assert.match(provisioningSource, /apiKeyHash: placeholderApiKeyHash/);
assert.match(provisioningSource, /clientId: client\.id/);
assert.doesNotMatch(provisioningSource, /rawKey/);

assert.match(apiKeyFormSource, /filteredClients/);
assert.match(apiKeyFormSource, /This organization has no Client record yet/);

console.log("Organization Client backfill verification passed.");
