// Next.js instrumentation hook -- onRequestError fires for any server-side
// error (Server Components, Route Handlers, Server Actions, middleware),
// giving us one central place to send an alert email instead of adding
// try/catch-and-alert to every route individually. See
// src/lib/error-alerts.ts for the actual alerting logic.

import { alertOnServerError } from "@/lib/error-alerts";

export async function register() {
  // No startup instrumentation needed yet -- this export is required for
  // Next.js to load this file at all.
}

export async function onRequestError(
  error: unknown,
  request: { path: string },
  context: { routeType?: string }
) {
  await alertOnServerError({
    message: error instanceof Error ? error.message : String(error),
    routePath: request.path,
    routeType: context.routeType,
  });
}
