"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import type {
  DashboardApiKeyClientOption,
  DashboardApiKeyOrganizationOption,
} from "@/lib/dashboard-api-keys";
import {
  createApiKeyAction,
  type CreateApiKeyActionState,
} from "@/app/dashboard/api-keys/actions";

const INITIAL_STATE: CreateApiKeyActionState = {
  status: "idle",
  message: null,
  createdKey: null,
};

export function ApiKeyCreateForm({
  clients,
  organizations,
}: {
  clients: DashboardApiKeyClientOption[];
  organizations: DashboardApiKeyOrganizationOption[];
}) {
  const [state, formAction, pending] = useActionState(
    createApiKeyAction,
    INITIAL_STATE
  );
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? ""
  );
  const filteredClients = useMemo(
    () => clients.filter((client) => client.organizationId === organizationId),
    [clients, organizationId]
  );
  const hasClientsForSelectedOrganization = filteredClients.length > 0;

  return (
    <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        Create API key
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        The raw key is shown once only. Store it in the client&apos;s password
        manager or secret manager immediately.
      </p>

      <form action={formAction} className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500">Label</span>
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            maxLength={80}
            name="name"
            placeholder="CRM production key"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-500">
            Organization
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            name="organizationId"
            onChange={(event) => setOrganizationId(event.target.value)}
            required
            value={organizationId}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-500">
            Client association
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            name="clientId"
            required
          >
            <option value="">Select client</option>
            {filteredClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-500">
            Expires at
          </span>
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            name="expiresAt"
            type="date"
          />
        </label>

        <div className="flex items-end">
          <button
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            disabled={pending || !organizationId || !hasClientsForSelectedOrganization}
            type="submit"
          >
            {pending ? "Creating..." : "Create key"}
          </button>
        </div>
      </form>

      {organizationId && !hasClientsForSelectedOrganization && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This organization has no Client record yet. Create or link a Client
          before creating an intake-capable API key.
        </div>
      )}

      {state.message && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            state.status === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-semibold">{state.message}</p>
          {state.createdKey && (
            <div className="mt-3">
              <p className="text-xs mb-1">One-time raw API key:</p>
              <code className="block overflow-x-auto rounded-lg bg-white border border-green-200 px-3 py-2 text-xs font-mono text-green-900">
                {state.createdKey.rawKey}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
