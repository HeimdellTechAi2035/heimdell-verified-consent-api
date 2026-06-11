import type { Metadata } from "next";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { STAFF_CREATABLE_ROLES } from "@/lib/dashboard-staff";
import { provisionStaffUser } from "./actions";

export const metadata: Metadata = {
  title: "New Staff - Heimdell",
};

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-input":
    "Check the required fields. Temporary passwords must be at least 12 characters, and the selected role must be allowed.",
  "user-exists": "An internal dashboard user with this email already exists.",
  "supabase-not-configured":
    "Supabase admin provisioning is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
  "supabase-user-create-failed":
    "Supabase could not create the auth user. Confirm the email is not already registered and the project allows admin-created users.",
  "provisioning-failed":
    "Staff provisioning failed before completion. Check the server logs for a safe operational error summary.",
};

const ROLE_LABELS: Record<(typeof STAFF_CREATABLE_ROLES)[number], string> = {
  CLIENT_MANAGER: "Client manager",
  SELLER: "Seller",
  COMPLIANCE_VIEWER: "Compliance viewer",
};

export default async function NewStaffPage({ searchParams }: Props) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <DashboardRoleGate section="staff">
      <DashboardHeader
        title="Create Staff User"
        subtitle="Create a dashboard user for the current organization only."
        action={
          <Link
            href="/dashboard/staff"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to staff
          </Link>
        }
      />

      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-900">
            Tenant-scoped staff creation
          </p>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">
            Staff users are linked only to your current organization. No
            organization selector is accepted by this form or server action.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <form action={provisionStaffUser} className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Full name</span>
            <input
              name="fullName"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Jane Smith"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="jane@example.com"
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

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Role</span>
            <select
              name="role"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {STAFF_CREATABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
            <Link
              href="/dashboard/staff"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create staff user
            </button>
          </div>
        </form>
      </div>
    </DashboardRoleGate>
  );
}
