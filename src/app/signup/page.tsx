import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";
import { submitOrganizationSignup } from "./actions";

export const metadata: Metadata = {
  title: "Sign up - Heimdell",
};

type Props = {
  searchParams: Promise<{
    error?: string;
    submitted?: string;
  }>;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;

  if (params.submitted === "1") {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-md rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-gray-900">
              Application received
            </h1>
            <p className="mt-3 text-sm text-gray-600">
              Thanks for applying. Our team reviews every application — including your Companies
              House and ICO registration details — before activating an account. We&rsquo;ll email
              you once it&rsquo;s been reviewed.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Back to home
            </Link>
          </div>
        </main>
        <LegalFooter />
      </div>
    );
  }

  const errorMessage =
    params.error === "invalid-input"
      ? "Check the required fields and try again."
      : params.error === "email-in-use"
      ? "That email is already linked to an active Heimdell account."
      : params.error === "rate-limited"
      ? "Too many attempts. Please wait a minute and try again."
      : params.error === "submission-failed"
      ? "We couldn't submit your application. Please try again shortly."
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">
              Sign up for Heimdell
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Tell us about your company. We manually review every application — including your
              Companies House and ICO registration numbers — before activating an account.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          )}

          <form action={submitOrganizationSignup} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Company name</span>
              <input className={inputClass} name="organizationName" required type="text" />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Companies House number</span>
                <input className={inputClass} name="companiesHouseNumber" required type="text" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">ICO registration number</span>
                <input className={inputClass} name="icoRegistrationNumber" required type="text" />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Business address</span>
              <input className={inputClass} name="businessAddress" required type="text" />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Your name</span>
                <input className={inputClass} name="primaryContactName" required type="text" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Phone (optional)</span>
                <input className={inputClass} name="primaryContactPhone" type="tel" />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input className={inputClass} name="primaryContactEmail" required type="email" />
              <span className="mt-1 block text-xs text-gray-400">
                This becomes your login once your application is approved.
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Submit application
            </button>
          </form>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
