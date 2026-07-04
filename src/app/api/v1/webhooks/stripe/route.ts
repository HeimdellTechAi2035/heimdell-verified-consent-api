// POST /api/v1/webhooks/stripe
// Inbound Stripe webhook. Verifies the signature via the Stripe SDK
// (stripe.webhooks.constructEvent), then credits the Organization's balance
// on checkout.session.completed. Idempotent on the Checkout Session's
// payment_intent id -- re-delivered events never double-credit.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { creditOrganizationBalance } from "@/lib/credit-ledger";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const organizationId = session.metadata?.organizationId;
    const credits = Number(session.metadata?.credits ?? "0");
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.id;

    if (!organizationId || !Number.isFinite(credits) || credits <= 0) {
      console.error("[webhooks/stripe] checkout.session.completed missing/invalid metadata", {
        sessionId: session.id,
      });
      return NextResponse.json({ ok: true }); // acknowledge, nothing sane to do with it
    }

    try {
      await db.$transaction(async (tx) => {
        const existing = await tx.creditLedgerEntry.findFirst({
          where: { relatedStripePaymentIntentId: paymentIntentId, type: "PURCHASE" },
          select: { id: true },
        });

        if (existing) {
          return; // already processed this payment -- idempotent no-op
        }

        await creditOrganizationBalance(tx, {
          organizationId,
          amount: credits,
          type: "PURCHASE",
          relatedStripePaymentIntentId: paymentIntentId,
          description: `Stripe checkout ${session.id}`,
        });
      });
    } catch (err) {
      console.error("[webhooks/stripe] failed to credit organization:", err instanceof Error ? err.name : err);
      return NextResponse.json({ ok: false, error: "Processing failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
