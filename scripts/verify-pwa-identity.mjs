#!/usr/bin/env node
// Verifies the three PWA identities (company/client/seller) are complete,
// distinct, and that the service worker never caches consent-sensitive routes.

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

const pwaIdentity = loadTsModule("src/lib/pwa-identity.ts");

const ALL_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
];

for (const role of ALL_ROLES) {
  const appKey = pwaIdentity.getPwaAppKeyForRole(role);
  assert.ok(["company", "client", "seller"].includes(appKey), `${role} must map to a known app key`);
}

assert.equal(pwaIdentity.getPwaAppKeyForRole("PLATFORM_ADMIN"), "company");
assert.equal(pwaIdentity.getPwaAppKeyForRole("OWNER"), "company");
assert.equal(pwaIdentity.getPwaAppKeyForRole("CLIENT_OWNER"), "client");
assert.equal(pwaIdentity.getPwaAppKeyForRole("CLIENT_MANAGER"), "client");
assert.equal(pwaIdentity.getPwaAppKeyForRole("ADMIN"), "client");
assert.equal(pwaIdentity.getPwaAppKeyForRole("MANAGER"), "client");
assert.equal(pwaIdentity.getPwaAppKeyForRole("COMPLIANCE_VIEWER"), "client");
assert.equal(pwaIdentity.getPwaAppKeyForRole("SELLER"), "seller");

const identities = pwaIdentity.PWA_APP_IDENTITIES;
const appKeys = ["company", "client", "seller"];

const manifestUrls = new Set();
const ids = new Set();

for (const key of appKeys) {
  const identity = identities[key];
  assert.ok(identity, `identity for ${key} must exist`);
  assert.equal(identity.key, key);
  assert.ok(identity.name.length > 0, `${key} must have a name`);
  assert.ok(identity.manifestUrl.endsWith(".webmanifest"), `${key} manifestUrl must be a .webmanifest URL`);
  assert.equal(identity.scope, "/");
  assert.ok(identity.startUrl.startsWith("/"), `${key} startUrl must be same-origin`);

  const manifest = pwaIdentity.buildManifest(key);
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, `${key} manifest must have icons`);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"), `${key} manifest must have a 192x192 icon`);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"), `${key} manifest must have a 512x512 icon`);
  assert.ok(manifest.id, `${key} manifest must have an explicit id`);

  manifestUrls.add(identity.manifestUrl);
  ids.add(identity.id);
}

assert.equal(manifestUrls.size, appKeys.length, "manifest URLs must be unique across apps");
assert.equal(ids.size, appKeys.length, "manifest ids must be unique across apps");

const themeColors = new Set(appKeys.map((key) => identities[key].themeColor));
assert.equal(themeColors.size, appKeys.length, "theme colors must be distinct per app");

const serviceWorker = readFileSync("public/sw.js", "utf8");
for (const excludedPrefix of ["/api/", "/dashboard/", "/v/", "/embed/"]) {
  assert.ok(
    serviceWorker.includes(excludedPrefix),
    `service worker must explicitly exclude ${excludedPrefix} from caching`
  );
}

// The excluded-route check must run, and return, before any cache.put call —
// otherwise a sensitive route could still fall through to caching logic.
const excludeCheckIndex = serviceWorker.indexOf("isExcludedFromCaching(url.pathname)");
const firstCachePutIndex = serviceWorker.indexOf("cache.put(");
assert.ok(excludeCheckIndex !== -1, "fetch handler must check isExcludedFromCaching");
assert.ok(firstCachePutIndex !== -1, "service worker must cache static assets somewhere");
assert.ok(
  excludeCheckIndex < firstCachePutIndex,
  "the excluded-route check must appear before any cache.put call in the fetch handler"
);

const securityHeaders = readFileSync("src/lib/security-headers.ts", "utf8");
assert.ok(securityHeaders.includes("worker-src"), "CSP must declare worker-src for the service worker");

console.log("PWA identity verification passed.");
