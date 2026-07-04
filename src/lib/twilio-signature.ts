// Twilio request signature verification (X-Twilio-Signature), hand-rolled
// to match the existing codebase's dependency-free style for Twilio (no
// `twilio` SDK is installed -- see src/lib/notification-providers.ts).
//
// Algorithm (per Twilio's documented scheme): HMAC-SHA1, keyed by the
// account Auth Token, over the exact request URL Twilio was given
// concatenated with each POST parameter's key+value, sorted by key.

import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Reconstructs the exact URL Twilio was told to call. Deliberately built
 * from APP_URL (a trusted env var) + the request's own path/query --
 * NEVER from req.url/host headers, since a proxy layer (e.g. Netlify) can
 * normalize scheme/host in ways that no longer match what Twilio actually
 * signed, while the path and query string pass through untouched.
 */
export function buildCanonicalTwilioUrl(request: NextRequest): string {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

export function parseTwilioFormBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }
  return params;
}

export function computeTwilioSignature(params: {
  url: string;
  formParams: Record<string, string>;
  authToken: string;
}): string {
  const sortedKeys = Object.keys(params.formParams).sort();
  let data = params.url;
  for (const key of sortedKeys) {
    data += key + params.formParams[key];
  }
  return createHmac("sha1", params.authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(params: {
  url: string;
  formParams: Record<string, string>;
  authToken: string;
  signature: string;
}): boolean {
  const expected = computeTwilioSignature({
    url: params.url,
    formParams: params.formParams,
    authToken: params.authToken,
  });

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(params.signature);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export class TwilioSignatureError extends Error {}

/**
 * Reads the raw body, parses it, and verifies the signature in one step --
 * the standard entry point for every inbound Twilio webhook route.
 * Throws TwilioSignatureError on any failure (missing header, missing auth
 * token config, or a mismatched signature).
 */
export async function verifyTwilioRequest(
  request: NextRequest
): Promise<Record<string, string>> {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    throw new TwilioSignatureError("Missing X-Twilio-Signature header.");
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    throw new TwilioSignatureError("TWILIO_AUTH_TOKEN is not configured.");
  }

  const rawBody = await request.text();
  const formParams = parseTwilioFormBody(rawBody);
  const url = buildCanonicalTwilioUrl(request);

  const valid = verifyTwilioSignature({ url, formParams, authToken, signature });
  if (!valid) {
    throw new TwilioSignatureError("Invalid Twilio request signature.");
  }

  return formParams;
}
