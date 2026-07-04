import Stripe from "stripe";

let cachedClient: Stripe | null = null;

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

/// Lazily-created singleton Stripe client. Throws a clear configuration
/// error rather than letting the Stripe SDK throw its own less obvious one.
export function getStripeClient(): Stripe {
  if (cachedClient) {
    return cachedClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeConfigurationError(
      "STRIPE_SECRET_KEY is not configured. Set it in your environment to enable credit purchases."
    );
  }

  cachedClient = new Stripe(secretKey);
  return cachedClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new StripeConfigurationError(
      "STRIPE_WEBHOOK_SECRET is not configured. Set it in your environment to verify Stripe webhooks."
    );
  }
  return secret;
}
