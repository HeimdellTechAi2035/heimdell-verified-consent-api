"use server";

import { redirect } from "next/navigation";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { CLIENT_OWNER_AND_PLATFORM_ROLES } from "@/lib/dashboard-role-policy";
import { getStripeClient, StripeConfigurationError } from "@/lib/stripe";
import { CREDIT_PACKS } from "@/lib/credit-pricing";

export type BuyCreditsActionState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function createCreditCheckoutSessionAction(
  _state: BuyCreditsActionState,
  formData: FormData
): Promise<BuyCreditsActionState> {
  const context = await requireDashboardRole(CLIENT_OWNER_AND_PLATFORM_ROLES);

  const packIndex = Number(formData.get("packIndex"));
  const pack = CREDIT_PACKS[packIndex];
  if (!pack) {
    return { status: "error", message: "Select a valid credit pack." };
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  let checkoutUrl: string;

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: pack.priceGBP * 100,
            product_data: {
              name: `${pack.credits} Heimdell verification credits`,
            },
          },
        },
      ],
      client_reference_id: context.organization.id,
      metadata: {
        organizationId: context.organization.id,
        credits: String(pack.credits),
      },
      success_url: `${appUrl}/dashboard/credits?purchase=success`,
      cancel_url: `${appUrl}/dashboard/credits?purchase=cancelled`,
    });

    if (!session.url) {
      return { status: "error", message: "Stripe did not return a checkout URL." };
    }

    checkoutUrl = session.url;
  } catch (error) {
    console.error("[credits] checkout session creation failed", {
      organizationId: context.organization.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    if (error instanceof StripeConfigurationError) {
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: "Could not start checkout. Try again shortly.",
    };
  }

  redirect(checkoutUrl);
}
