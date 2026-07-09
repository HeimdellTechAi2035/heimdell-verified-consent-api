import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { LegalFooter } from "@/components/LegalFooter";
import { submitContactMessage } from "./actions";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Heimdell team — ask about pricing, integrations, or how verified consent would fit your sales process.",
  alternates: { canonical: "/contact" },
};

type Props = {
  searchParams: Promise<{
    error?: string;
    submitted?: string;
  }>;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default async function ContactPage({ searchParams }: Props) {
  const params = await searchParams;

  const errorMessage =
    params.error === "invalid-input"
      ? "Check the required fields and try again."
      : params.error === "rate-limited"
      ? "Too many attempts. Please wait a minute and try again."
      : params.error === "submission-failed"
      ? "We couldn't send your message. Please try again shortly, or email us directly."
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Talk to us
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-gray-600 sm:text-lg">
            Questions about pricing, how it fits your CRM, or anything else — send us a message
            and a real person will get back to you.
          </p>
        </section>

        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-md px-4 sm:px-6">
            {params.submitted === "1" ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                <h2 className="text-lg font-semibold text-gray-900">Message sent</h2>
                <p className="mt-3 text-sm text-gray-600">
                  Thanks for getting in touch. We&rsquo;ll reply to your email as soon as we can.
                </p>
                <Link
                  href="/"
                  className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Back to home
                </Link>
              </div>
            ) : (
              <form action={submitContactMessage} className="space-y-4">
                {errorMessage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {errorMessage}
                  </div>
                )}

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Your name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    className={inputClass}
                    placeholder="Jane Smith"
                  />
                </div>

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
                    className={inputClass}
                    placeholder="jane@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="companyName"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Company name{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="companyName"
                    name="companyName"
                    type="text"
                    autoComplete="organization"
                    className={inputClass}
                    placeholder="Acme Telecom Ltd"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    minLength={10}
                    maxLength={4000}
                    className={inputClass}
                    placeholder="Tell us a bit about your sales process and what you're looking for."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Send message
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
