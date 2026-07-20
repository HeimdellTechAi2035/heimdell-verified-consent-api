// POST /api/internal/run-workers
// Runs one finite batch of both the notification-retry and webhook-retry
// workers. Both workers' actual retry/backoff logic was already fully
// implemented (src/lib/notification-delivery.ts, src/lib/webhook-delivery.ts)
// but nothing in production ever called it -- the only callers were CLI
// scripts (npm run worker:notifications / worker:webhooks) with no
// scheduler. A FAILED notification or webhook with a future nextAttemptAt
// just sat there forever. This endpoint is meant to be hit on a schedule
// (see .github/workflows/retry-workers.yml) so retries actually happen.

import { NextResponse } from "next/server";
import { processCustomerNotificationDeliveries } from "@/lib/notification-delivery";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (!secret) {
    console.error("[internal/run-workers] INTERNAL_WORKER_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [notifications, webhooks] = await Promise.all([
    processCustomerNotificationDeliveries({ limit: 25 }).catch((err) => {
      console.error("[internal/run-workers] notification worker batch failed:", err);
      return null;
    }),
    processWebhookDeliveries({ limit: 25 }).catch((err) => {
      console.error("[internal/run-workers] webhook worker batch failed:", err);
      return null;
    }),
  ]);

  return NextResponse.json({
    ok: true,
    notifications,
    webhooks,
  });
}
