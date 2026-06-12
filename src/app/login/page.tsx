import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LegalFooter } from "@/components/LegalFooter";
import { getCurrentDashboardUser } from "@/lib/dashboard-auth";
import { signInWithPassword } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard Login - Heimdell",
};

type Props = {
  searchParams: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const currentUser = await getCurrentDashboardUser();
  if (currentUser) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage =
    params.error === "missing-email"
      ? "Enter your work email address."
      : params.error === "missing-password"
      ? "Enter your password."
      : params.error === "signin-failed"
      ? "Sign in failed. Confirm the user was invited in Supabase Auth and has a password set."
      : params.error === "session-expired"
      ? "Your sign-in session could not be confirmed. Please sign in again."
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            Heimdell Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in with an invited dashboard account.
          </p>
        </div>

        {params.sent === "1" && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Login link sent. Check your email to continue.
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <form action={signInWithPassword} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sign in
          </button>
        </form>

      </div>
      </main>
      <LegalFooter />
    </div>
  );
}
