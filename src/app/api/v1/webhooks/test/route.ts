// Phase 8 — POST /api/v1/webhooks/test
// Authenticated endpoint that builds and signs a test webhook payload so
// clients can verify their HMAC-SHA256 signature verification logic.
//
// The payload is returned in the response and is NEVER sent externally.

import { type NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { errors } from "@/lib/errors";
import {
  buildWebhookPayload,
  createWebhookSignatureHeader,
} from "@/lib/webhooks";
import { decryptWebhookSecret } from "@/lib/webhook-secrets";
import { getSafeWebhookDestinationHost } from "@/lib/dashboard-webhooks";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // ------------------------------------------------------------------
  // 1. Authenticate client via x-api-key
  // ------------------------------------------------------------------
  const apiKey = req.headers.get("x-api-key");
  const preAuthLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyPreAuth,
    route: "POST /api/v1/webhooks/test",
    identifiers: [apiKey ? safeFingerprint(apiKey, 16) : "missing-api-key"],
  });
  if (preAuthLimited) return preAuthLimited;

  if (!apiKey) {
    return errors.unauthorized("x-api-key header is required");
  }

  const auth = await authenticateApiKey(apiKey);
  if (!auth) {
    return errors.unauthorized("Invalid, revoked, or expired API key");
  }

  if (!auth.client) {
    return errors.forbidden(
      "API key is not linked to a client for webhook testing"
    );
  }

  const client = auth.client;

  const clientLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyAuthenticated,
    route: "POST /api/v1/webhooks/test:client",
    identifiers: [auth.clientId ?? auth.organizationId ?? "api-key"],
  });
  if (clientLimited) return clientLimited;

  // ------------------------------------------------------------------
  // 2. Build a safe test payload
  //    — no real sale/session IDs, no sensitive data
  // ------------------------------------------------------------------
  const testPayload = buildWebhookPayload({
    event: "webhook.test",
    clientId: client.id,
    saleId: "test-sale-id",
    clientReference: null,
    verificationSessionId: "test-session-id",
    status: "TEST",
    data: {
      message: "This is a test webhook from Heimdell Verified Consent API",
      webhook_destination_host: getSafeWebhookDestinationHost(client.webhookUrl),
    },
  });

  // ------------------------------------------------------------------
  // 3. Sign the payload if the client has a webhook secret configured
  // ------------------------------------------------------------------
  const webhookSecret = decryptWebhookSecret(client.webhookSecret);
  const signatureHeader = webhookSecret
    ? createWebhookSignatureHeader(testPayload, webhookSecret)
    : null;

  // ------------------------------------------------------------------
  // 4. Return safe preview — nothing is sent externally
  // ------------------------------------------------------------------
  return NextResponse.json({
    ok: true,
    event: "webhook.test",
    payload: testPayload,
    signature_header: signatureHeader,
    note: webhookSecret
      ? "Payload is signed with your configured webhook secret. Use the signature_header value as the x-hvcs-signature header when verifying your endpoint."
      : "No webhook secret configured on your account — payload is unsigned. Configure a webhook endpoint from the dashboard integrations page to enable payload signing.",
  });
}
