"use client";

import { useActionState } from "react";
import {
  disableWebhookEndpointAction,
  saveWebhookEndpointAction,
  type WebhookSettingsActionState,
} from "@/app/dashboard/integrations/actions";
import type { DashboardWebhookEndpointRow } from "@/lib/dashboard-webhook-settings";

const INITIAL_STATE: WebhookSettingsActionState = {
  ok: false,
  message: null,
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SecretNotice({ state }: { state: WebhookSettingsActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
        state.ok
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <p className="font-semibold">{state.message}</p>
      {state.oneTimeSecret && (
        <div className="mt-3">
          <p className="text-xs">
            One-time signing secret. Store it now; Heimdell will only show it
            once.
          </p>
          <code className="mt-2 block break-all rounded-lg border border-green-200 bg-white px-3 py-2 font-mono text-xs text-green-900">
            {state.oneTimeSecret}
          </code>
        </div>
      )}
    </div>
  );
}

export function WebhookEndpointManager({
  rows,
  canManage,
}: {
  rows: DashboardWebhookEndpointRow[];
  canManage: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveWebhookEndpointAction,
    INITIAL_STATE
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableWebhookEndpointAction,
    INITIAL_STATE
  );

  return (
    <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Webhook endpoint management
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Configure signed outbound webhook destinations per API client.
            Secrets are generated server-side and shown once only.
          </p>
        </div>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
          {canManage ? "Platform admin management" : "Read-only metadata"}
        </span>
      </div>

      <SecretNotice state={saveState.message ? saveState : disableState} />

      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-gray-700">
              No clients available
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Link a client to this organization before configuring webhooks.
            </p>
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.clientId}
              className="rounded-xl border border-gray-100 bg-gray-50 p-4"
            >
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Client
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {row.clientName}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-gray-400">
                    {row.clientId}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Destination
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {row.destinationHost ?? "Not configured"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {row.enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Signing secret
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {row.signingSecretConfigured ? "Configured" : "Not configured"}
                  </p>
                  {row.signingSecretDisplay && (
                    <p className="mt-0.5 font-mono text-xs text-gray-500">
                      {row.signingSecretDisplay}
                    </p>
                  )}
                  {row.signingSecretStorage === "legacy_plaintext" && (
                    <p className="mt-0.5 text-xs text-amber-600">
                      Rotate to encrypt at rest
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-500">
                    Updated {formatDateTime(row.updatedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Delivery health
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Last success {formatDateTime(row.lastSuccessfulDeliveryAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Last failure {formatDateTime(row.lastFailureAt)}
                  </p>
                </div>
              </div>

              {canManage && (
                <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 lg:grid-cols-[1fr_auto]">
                  <form action={saveAction} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input type="hidden" name="clientId" value={row.clientId} />
                    <input
                      name="webhookUrl"
                      type="url"
                      placeholder="https://crm.example.com/heimdell/webhook"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                      required
                    />
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600">
                      <input name="rotateSecret" type="checkbox" />
                      Regenerate secret
                    </label>
                    <button
                      type="submit"
                      disabled={savePending}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
                    >
                      Save endpoint
                    </button>
                  </form>
                  <form action={disableAction}>
                    <input type="hidden" name="clientId" value={row.clientId} />
                    <button
                      type="submit"
                      disabled={disablePending}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:text-gray-300"
                    >
                      Disable
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
