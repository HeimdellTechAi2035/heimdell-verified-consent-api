import type { Metadata } from "next";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { provisionClientCompany } from "./actions";

export const metadata: Metadata = {
  title: "Provision Client - Heimdell",
};

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-input":
    "Check the required fields. Slugs must use lowercase letters, numbers, and hyphens, and the temporary password must be at least 12 characters.",
  "organization-exists":
    "An organization with this slug already exists. Choose a unique slug.",
  "user-exists":
    "An internal dashboard user with this client admin email already exists.",
  "active-user":
    "This email is already attached to an active organization.",
  "supabase-not-configured":
    "Supabase admin provisioning is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
  "supabase-user-create-failed":
    "Supabase could not create the auth user. Confirm the email is not already registered and the project allows admin-created users.",
  "provisioning-failed":
    "Provisioning failed before completion. Check the server logs for a safe operational error summary.",
};

export default async function NewClientPage({ searchParams }: Props) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <DashboardRoleGate section="clients">
      <DashboardHeader
        title="Provision Client Company"
        subtitle="Create a tenant organization and first client owner without editing local environment files."
        action={
          <Link
            href="/dashboard/clients"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to clients
          </Link>
        }
      />

      <div className="max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-900">
            Platform-admin-only onboarding
          </p>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">
            This creates a Supabase Auth user, maps that identity to an internal
            Heimdell user, and assigns the user to the new organization. The
            temporary password is never stored by Heimdell.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <form action={provisionClientCompany} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Company / organization name
              </span>
              <input
                name="organizationName"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Acme Broadband Ltd"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Organization slug
              </span>
              <input
                name="organizationSlug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="acme-broadband"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Primary contact name
              </span>
              <input
                name="primaryContactName"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Jane Smith"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Primary contact email
              </span>
              <input
                name="primaryContactEmail"
                type="email"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="jane@example.com"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Client admin email
              </span>
              <input
                name="clientAdminEmail"
                type="email"
                required
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="admin@example.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Temporary password
              </span>
              <input
                name="temporaryPassword"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Phone
              </span>
              <input
                name="primaryContactPhone"
                type="tel"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Optional"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Notes
              </span>
              <textarea
                name="notes"
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Optional internal onboarding note"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
            <Link
              href="/dashboard/clients"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Provision client
            </button>
          </div>
        </form>
      </div>
    </DashboardRoleGate>
  );
}
