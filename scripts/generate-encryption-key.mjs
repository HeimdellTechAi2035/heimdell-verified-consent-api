#!/usr/bin/env node
// scripts/generate-encryption-key.mjs
// Generates a cryptographically secure 32-byte (256-bit) base64-encoded key
// suitable for use as ENCRYPTION_KEY in .env.local.
//
// Usage:
//   node scripts/generate-encryption-key.mjs
//   npm run generate:encryption-key

import { randomBytes } from "crypto";

const key = randomBytes(32).toString("base64");

console.log("\nGenerated ENCRYPTION_KEY:");
console.log(key);
console.log("\nCopy this into .env.local as:");
console.log(`ENCRYPTION_KEY="${key}"\n`);
