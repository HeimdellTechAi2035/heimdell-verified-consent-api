import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { LegalFooter } from "@/components/LegalFooter";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "A plain-English walkthrough of how Heimdell turns a sale into a tamper-evident consent certificate — from CRM submission to customer confirmation.",
  alternates: { canonical: "/how-it-works" },
};

const faqs = [
  {
    question: "What happens if the customer never responds?",
    answer:
      "The verification link (or phone call) simply expires after a set time. Nothing is confirmed and no certificate is created — the sale sits as pending until your seller follows up or sends a new one.",
  },
  {
    question: "What if the customer declines?",
    answer:
      "They can decline instead of confirming, and the reason is recorded. No certificate is created for a declined sale, so there's no risk of a false positive.",
  },
  {
    question: "Can I use my own terms, cancellation policy, and wording?",
    answer:
      "Yes. Each client company sets its own terms and conditions, cooling-off wording, and Direct Debit Guarantee text once, and it's shown to every customer automatically.",
  },
  {
    question: "Is a Heimdell certificate legally binding?",
    answer:
      "A certificate is a clear, tamper-evident record of what the customer was shown and confirmed, with a timestamp and cryptographic fingerprint. It's strong evidence for resolving a dispute — but as with any evidence, how it's weighed in a specific legal or regulatory situation is for your own legal advisers to confirm.",
  },
  {
    question: "Does this replace my CRM?",
    answer:
      "No. Heimdell sits alongside your CRM. Sales still get created wherever your team already works — Heimdell just handles getting the customer's own confirmation and turning it into evidence.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            How it works
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
            No jargon — just what happens, in order, from the moment a seller makes a sale to the
            moment you have proof of it.
          </p>
        </section>

        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold text-gray-900">
              1. A seller submits the sale
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Your seller finishes talking to a customer — on the phone, at the door, wherever —
              and enters the sale. This happens one of two ways:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-gray-600">
              <li>
                <strong className="text-gray-900">Automatically,</strong> if your CRM (like
                HighLevel, Salesforce, or your own system) sends it straight through with one API
                call — the seller never leaves the tool they already use.
              </li>
              <li>
                <strong className="text-gray-900">By hand,</strong> if a member of staff enters
                the sale details directly into Heimdell.
              </li>
            </ul>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Either way, all that&rsquo;s needed is the customer&rsquo;s details, what they&rsquo;re
              buying, the price, and — if relevant — their Direct Debit details.
            </p>

            <h2 className="mt-12 text-2xl font-semibold text-gray-900">
              2. The customer confirms it themselves
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              This is the important part: instead of trusting the seller&rsquo;s notes, we ask
              the customer directly. They get one of two things:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-gray-600">
              <li>
                <strong className="text-gray-900">A web link,</strong> which shows them exactly
                what was agreed — the product, the price, the terms, their cancellation rights,
                and the Direct Debit Guarantee if relevant — in plain English, on their own
                phone or computer.
              </li>
              <li>
                <strong className="text-gray-900">A phone call,</strong> for customers who&rsquo;d
                rather listen than read. The same information is read out to them, and they
                confirm by pressing a key.
              </li>
            </ul>
            <p className="mt-4 text-base leading-7 text-gray-600">
              The customer can confirm everything is correct, or decline if something&rsquo;s
              wrong. Either way, that response is recorded.
            </p>

            <h2 className="mt-12 text-2xl font-semibold text-gray-900">
              3. A certificate is created
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              The moment the customer confirms, Heimdell generates a certificate: a record of
              what they saw, what they agreed to, and exactly when. It&rsquo;s fingerprinted with
              a cryptographic hash, so if a single character of it were ever changed, that change
              would be detectable. It shows up straight away in your dashboard and, if you use
              webhooks, can notify your CRM automatically too.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
              Who sees what
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-gray-600">
              Everyone gets their own dashboard, and only sees what&rsquo;s relevant to them.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-base font-semibold text-gray-900">Platform admin</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Heimdell staff who set up new client companies and keep the platform running.
                  They don&rsquo;t see customer sales data unless a client asks for support.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-base font-semibold text-gray-900">Client company</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Your management team sees everything for your company — all sales, all
                  verifications, all certificates — but never another company&rsquo;s data.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-base font-semibold text-gray-900">Sellers</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Each seller sees only the sales they personally submitted, and the status of
                  each one — nothing from the rest of the team.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
              Common questions
            </h2>
            <div className="mt-10 space-y-8">
              {faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="text-base font-semibold text-gray-900">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-gray-200 bg-blue-600 py-16">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              See it running with your own sale
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="w-full rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:w-auto"
              >
                Sign up your company
              </Link>
              <Link
                href="/pricing"
                className="w-full rounded-lg border border-blue-300 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
