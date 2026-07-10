// Lightweight server-error alerting -- no third-party error tracking
// service, just an email via the Resend integration already configured
// for notifications. Debounced in-memory so a burst of the same error
// (e.g. a DB outage causing every request to fail) sends one alert, not
// hundreds, matching the debounce style already used in rate-limit.ts.

import { sendEmailNotification } from "@/lib/notification-providers";

const ALERT_RECIPIENT = "andrew@heimdell-tech-ai.co.uk";
const DEBOUNCE_WINDOW_MS = 15 * 60 * 1000;

const recentAlerts = new Map<string, number>();

function shouldAlert(dedupeKey: string): boolean {
  const now = Date.now();
  const lastSent = recentAlerts.get(dedupeKey);

  if (lastSent && now - lastSent < DEBOUNCE_WINDOW_MS) {
    return false;
  }

  recentAlerts.set(dedupeKey, now);

  // Bound memory use -- this is a best-effort in-process debounce, not a
  // durable store, so an occasional duplicate alert after a restart is fine.
  if (recentAlerts.size > 200) {
    const oldestKey = recentAlerts.keys().next().value;
    if (oldestKey) {
      recentAlerts.delete(oldestKey);
    }
  }

  return true;
}

export async function alertOnServerError(params: {
  message: string;
  routePath?: string;
  routeType?: string;
}): Promise<void> {
  const dedupeKey = `${params.routePath ?? "unknown"}:${params.message.slice(0, 120)}`;

  if (!shouldAlert(dedupeKey)) {
    return;
  }

  const body = [
    `A server error occurred on Heimdell Verified Consent.`,
    ``,
    `Route: ${params.routePath ?? "unknown"}`,
    `Type: ${params.routeType ?? "unknown"}`,
    `Message: ${params.message}`,
    ``,
    `Further alerts for this same error are suppressed for 15 minutes.`,
    `Check Netlify's function logs for the full stack trace.`,
  ].join("\n");

  try {
    await sendEmailNotification({
      recipient: ALERT_RECIPIENT,
      subject: `Heimdell server error: ${params.routePath ?? "unknown route"}`,
      body,
    });
  } catch {
    // Never let alerting itself throw and mask the original error.
  }
}
