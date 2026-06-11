#!/usr/bin/env node
// Local safe webhook receiver for demo/testing.

import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const port = Number.parseInt(process.env.WEBHOOK_RECEIVER_PORT ?? "4010", 10);
const expectedSecret = process.env.WEBHOOK_TEST_SECRET ?? null;

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function verifySignature(rawBody, signatureHeader) {
  if (!expectedSecret) {
    return "not_configured";
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return "missing";
  }

  const received = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", expectedSecret)
    .update(rawBody)
    .digest("hex");

  try {
    const receivedBuffer = Buffer.from(received, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
      ? "valid"
      : "invalid";
  } catch {
    return "invalid";
  }
}

function buildSafeSummary(payload, headers, rawBody) {
  const signature = headers["x-heimdell-signature"] ?? headers["x-hvcs-signature"];
  return {
    method: "POST",
    event: payload?.event ?? headers["x-heimdell-event-type"] ?? null,
    delivery_id: headers["x-heimdell-delivery-id"] ?? payload?.data?.stable_delivery_id ?? null,
    signature_present: Boolean(signature),
    signature_status: verifySignature(rawBody, signature),
    sale_id: payload?.sale_id ?? null,
    client_reference: payload?.client_reference ?? null,
    verification_session_id: payload?.verification_session_id ?? null,
    certificate_id: payload?.certificate_id ?? null,
    status: payload?.status ?? null,
    sale_status: payload?.data?.sale_status ?? null,
    verification_status: payload?.data?.verification_status ?? null,
    product_name: payload?.data?.product_name ?? null,
    created_at: payload?.created_at ?? null,
  };
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    return;
  }

  let rawBody = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    rawBody += chunk;
  });
  req.on("end", () => {
    const payload = safeJsonParse(rawBody);
    const summary = buildSafeSummary(payload, req.headers, rawBody);

    console.log(JSON.stringify(summary, null, 2));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(port, () => {
  console.log(
    JSON.stringify(
      {
        ok: true,
        receiver: `http://localhost:${port}/webhook`,
        signature_verification: expectedSecret ? "enabled" : "disabled",
      },
      null,
      2
    )
  );
});
