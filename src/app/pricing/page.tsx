import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";
import {
  CREDIT_COST_LINK,
  CREDIT_COST_PHONE_CALL,
  CREDIT_PACKS,
} from "@/lib/credit-pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pay only for the verifications you send. Link verifications cost 1 credit, phone-call verifications cost 5 credits. Credit packs start from £20, and credits never expire.",
  alternates: { canonical: "/pricing" },
};

const faqs = [
  {
    question: "Do credits expire?",
    answer: "No. Credits you buy stay on your account until you use them.",
  },
  {
    question: "What's the difference between a link and a phone-call verification?",
    answer:
      "A link verification sends the customer a web page to review and confirm — this costs 1 credit. A phone-call verification calls the customer and reads the terms out loud, for 5 credits, since it costs more to run.",
  },
  {
    question: "What happens if I run out of credits?",
    answer:
      "You'll be able to top up from your dashboard at any time. New verifications simply can't be sent until you've added more credits.",
  },
  {
    question: "Is there a monthly subscription?",
    answer:
      "No. There's no minimum spend and no recurring fee — you only pay when you buy a credit pack.",
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

function perCreditPrice(priceGBP: number, credits: number): string {
  return (priceGBP / credits).toFixed(2);
}

export default function PricingPage() {
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
            Pay only for what you send
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
            No subscription. No minimum spend. Buy a pack of credits, use them whenever you send
            a verification, and top up whenever you like.
          </p>
        </section>

        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900">
              What a credit buys you
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-6 text-center">
                <p className="text-3xl font-semibold text-gray-900">{CREDIT_COST_LINK}</p>
                <p className="mt-1 text-sm font-medium text-gray-900">credit</p>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  One link verification — the customer reviews and confirms on a web page.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-6 text-center">
                <p className="text-3xl font-semibold text-gray-900">{CREDIT_COST_PHONE_CALL}</p>
                <p className="mt-1 text-sm font-medium text-gray-900">credits</p>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  One phone-call verification — we call the customer and read the terms aloud.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900">Credit packs</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-base leading-7 text-gray-600">
              The bigger the pack, the cheaper each credit works out.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {CREDIT_PACKS.map((pack, index) => (
                <div
                  key={pack.credits}
                  className={`rounded-xl border p-6 text-center ${
                    index === 1
                      ? "border-blue-600 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  {index === 1 && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Most popular
                    </p>
                  )}
                  <p className="mt-2 text-3xl font-semibold text-gray-900">
                    £{pack.priceGBP}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{pack.credits} credits</p>
                  <p className="mt-4 text-xs text-gray-500">
                    £{perCreditPrice(pack.priceGBP, pack.credits)} per credit ·{" "}
                    {Math.floor(pack.credits / CREDIT_COST_PHONE_CALL)} phone calls or{" "}
                    {pack.credits} link checks
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-gray-500">
              Need a larger volume?{" "}
              <Link href="/contact" className="font-semibold text-blue-600 hover:text-blue-700">
                Talk to us
              </Link>{" "}
              about a custom pack.
            </p>
          </div>
        </section>

        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900">
              Billing questions
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
              Ready to get started?
            </h2>
            <div className="mt-8">
              <Link
                href="/signup"
                className="inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Sign up your company
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
