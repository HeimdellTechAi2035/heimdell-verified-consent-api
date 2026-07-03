import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LegalFooter } from "@/components/LegalFooter";
import { getCurrentDashboardUser } from "@/lib/dashboard-auth";
import { isPwaAppKey, PWA_APP_IDENTITIES } from "@/lib/pwa-identity";
import { signInWithPassword } from "../actions";

type Props = {
  params: Promise<{ app: string }>;
  searchParams: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { app } = await params;
  if (!isPwaAppKey(app)) {
    return {};
  }
  return { title: `${PWA_APP_IDENTITIES[app].name} - Sign in` };
}

export default async function BrandedLoginPage({ params, searchParams }: Props) {
  const { app } = await params;

  if (!isPwaAppKey(app)) {
    notFound();
  }

  const identity = PWA_APP_IDENTITIES[app];

  const currentUser = await getCurrentDashboardUser();
  if (currentUser) {
    redirect("/dashboard");
  }

  const params_ = await searchParams;
  const errorMessage =
    params_.error === "missing-email"
      ? "Enter your work email address."
      : params_.error === "missing-password"
      ? "Enter your password."
      : params_.error === "signin-failed"
      ? "Sign in failed. Confirm the user was invited in Supabase Auth and has a password set."
      : params_.error === "session-expired"
      ? "Your sign-in session could not be confirmed. Please sign in again."
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-8">
          <div className="mb-6 flex items-center gap-3">
            <img src={identity.icons[0].src} alt="" aria-hidden="true" className="h-10 w-10 rounded-lg" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{identity.name}</h1>
              <p className="mt-0.5 text-sm text-gray-500">Sign in with an invited dashboard account.</p>
            </div>
          </div>

          {params_.sent === "1" && (
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
            <input type="hidden" name="app" value={app} />
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
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
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: identity.themeColor }}
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
