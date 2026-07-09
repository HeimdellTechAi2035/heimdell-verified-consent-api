import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { LegalFooter } from "@/components/LegalFooter";
import { CREDIT_PACKS } from "@/lib/credit-pricing";

export const metadata: Metadata = {
  title: "Verified Consent for Regulated Sales Teams",
  description:
    "Heimdell proves your customers said yes. Every sale gets a tamper-evident certificate showing the customer reviewed and confirmed the terms, cooling-off rights, and Direct Debit details themselves.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Heimdell Verified Consent — Proof your customers said yes",
    description:
      "Tamper-evident consent certificates for door-to-door, phone, and field sales teams. Stop disputes before they start.",
    url: "/",
    type: "website",
  },
};

const cheapestPack = CREDIT_PACKS[0];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Heimdell Tech Ai Ltd",
  alternateName: "Heimdell Verified Consent",
  url: "https://telecomcompliance.uk",
  description:
    "Verified consent and compliance evidence infrastructure for regulated sales teams.",
  identifier: "16478408",
  contactPoint: {
    "@type": "ContactPoint",
    email: "andrew@heimdell-tech-ai.co.uk",
    contactType: "sales",
  },
};

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
        {number}
      </span>
      <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{children}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
            Verified Consent for Regulated Sales Teams
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Prove your customers said yes — before anyone can say they didn&rsquo;t.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
            When one of your sellers signs up a customer, Heimdell sends the customer a simple
            link (or gives them a call) so they can review the sale in their own words and
            confirm it themselves. We turn that confirmation into a tamper-evident certificate —
            your proof, ready if anyone ever asks &ldquo;did I really agree to this?&rdquo;
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
            >
              Sign up your company
            </Link>
            <Link
              href="/how-it-works"
              className="w-full rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto"
            >
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            UK registered company · ICO registered · No card required to sign up
          </p>
        </section>

        {/* Problem / solution */}
        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
              The problem with a handshake
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-gray-600">
              When a seller signs someone up in person or over the phone, there&rsquo;s usually
              only one version of what was agreed: the seller&rsquo;s. If a customer later says
              they were misled, didn&rsquo;t understand the price, or never agreed to a Direct
              Debit, it&rsquo;s your word against theirs — and regulators, banks, and complaints
              teams don&rsquo;t like taking anyone&rsquo;s word for it.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-gray-600">
              Heimdell fixes that by getting the confirmation straight from the customer, in
              writing, immediately after the sale — and locking it so nobody (including us) can
              quietly change it afterwards.
            </p>
          </div>
        </section>

        {/* How it works, brief */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
              Three steps, no paperwork
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              <Step number={1} title="Seller submits the sale">
                Straight from your CRM, or entered by hand — the product, price, and customer
                details go in once.
              </Step>
              <Step number={2} title="Customer confirms it themselves">
                They get a link (or a phone call, read out to them) showing exactly what they
                signed up for, including their cancellation rights, in plain English.
              </Step>
              <Step number={3} title="A certificate is created">
                A tamper-evident record is generated the moment they confirm — dated, hashed, and
                ready to show anyone who asks.
              </Step>
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/how-it-works"
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Read the full walkthrough →
              </Link>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="border-t border-gray-200 bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
              Built for how your team actually sells
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Works with your CRM",
                  body: "Send sales in automatically from HighLevel, Salesforce, or any system that can make a simple API call.",
                },
                {
                  title: "Link or phone call",
                  body: "Most customers confirm with a link. For anyone who prefers to talk, we can call and read the terms out loud.",
                },
                {
                  title: "Cooling-off & Direct Debit, covered",
                  body: "Cancellation rights and Direct Debit Guarantee wording are shown and confirmed every time, automatically.",
                },
                {
                  title: "Three dashboards, one system",
                  body: "Your admin team, each client company, and individual sellers each see only what they need — nothing more.",
                },
                {
                  title: "Nothing sensitive left lying around",
                  body: "Bank details are encrypted, only the last 4 digits are ever shown, and raw evidence is never exposed in the dashboard.",
                },
                {
                  title: "Proof that holds up",
                  body: "Every certificate is fingerprinted with a cryptographic hash, so tampering after the fact is detectable.",
                },
              ].map((feature) => (
                <div key={feature.title} className="rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
              Pay only for verifications you send
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-gray-600">
              No monthly minimum. Buy a pack of credits and use them whenever you need to —
              starting from{" "}
              <span className="font-semibold text-gray-900">
                £{cheapestPack.priceGBP} for {cheapestPack.credits} link verifications
              </span>
              .
            </p>
            <div className="mt-6">
              <Link
                href="/pricing"
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                See full pricing →
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-gray-200 bg-blue-600 py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              Ready to stop taking the risk on a handshake?
            </h2>
            <p className="mt-4 text-base leading-7 text-blue-50">
              Sign up your company in a couple of minutes. Every application is reviewed by a
              real person before it goes live.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="w-full rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:w-auto"
              >
                Sign up your company
              </Link>
              <Link
                href="/contact"
                className="w-full rounded-lg border border-blue-300 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
              >
                Talk to us first
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
