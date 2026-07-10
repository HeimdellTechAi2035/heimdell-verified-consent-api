import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply to client companies using Heimdell Verified Consent.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <LegalSection heading="1. Who these terms are for">
        <p>
          These terms apply to any company (&ldquo;you&rdquo;, &ldquo;client&rdquo;) that signs
          up to use the Heimdell Verified Consent platform, operated by Heimdell Tech Ai Ltd
          (Company No. 16478408, &ldquo;Heimdell&rdquo;, &ldquo;we&rdquo;). By applying for or
          using an account, you agree to these terms.
        </p>
      </LegalSection>

      <LegalSection heading="2. What Heimdell does">
        <p>
          Heimdell lets you submit sales, send your customers a link or phone call to review and
          confirm what was agreed, and generates a tamper-evident certificate once they do. See{" "}
          <Link href="/how-it-works" className="text-blue-600 hover:underline">
            How It Works
          </Link>{" "}
          for the full detail.
        </p>
      </LegalSection>

      <LegalSection heading="3. Signing up">
        <p>
          Every application is manually reviewed before an account is activated. We may decline
          an application, or suspend or close an account, at our reasonable discretion — for
          example if the details provided appear false, or the account is used for purposes that
          breach these terms.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree that you (and anyone using an account under your organization) will:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Only submit sales you have a genuine, lawful basis to process</li>
          <li>Never use Heimdell to make a sale look verified when it wasn&rsquo;t</li>
          <li>Keep your own terms, cancellation policy, and cooling-off wording accurate and up to date in your account settings</li>
          <li>Keep API keys, passwords, and account access confidential and only give staff access they actually need</li>
          <li>Comply with data protection law for any customer data you submit</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Fees and credits">
        <p>
          Heimdell is pay-as-you-go: you buy a pack of credits and each verification uses some of
          your balance (see{" "}
          <Link href="/pricing" className="text-blue-600 hover:underline">
            Pricing
          </Link>{" "}
          for current rates). There is no recurring subscription fee. Credits do not expire.
          Prices may change for future purchases, but a purchase you&rsquo;ve already made isn&rsquo;t
          affected.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cancellation and refunds">
        <p>
          See our{" "}
          <Link href="/cooling-off" className="text-blue-600 hover:underline">
            Cooling-Off &amp; Cancellation Policy
          </Link>{" "}
          for the full detail on cancelling your account and refunds for unused credits.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data processing">
        <p>
          When you submit a sale, we process your customer&rsquo;s personal data on your behalf
          and under your instructions, as your data processor. Our{" "}
          <Link href="/data-processing-agreement" className="text-blue-600 hover:underline">
            Data Processing Agreement
          </Link>{" "}
          forms part of these terms and sets out how we handle that data, including the
          sub-processors we use.
        </p>
      </LegalSection>

      <LegalSection heading="8. Ownership">
        <p>
          Certificates, sale records, and evidence generated from your account belong to you. The
          Heimdell platform itself — the software, design, and infrastructure — belongs to us.
        </p>
      </LegalSection>

      <LegalSection heading="9. Availability">
        <p>
          We aim to keep Heimdell available and working reliably, but we don&rsquo;t guarantee
          uninterrupted service, and we&rsquo;re not liable for issues caused by third-party
          services we depend on (such as payment, calling, or hosting providers) that are outside
          our reasonable control.
        </p>
      </LegalSection>

      <LegalSection heading="10. Liability">
        <p>
          Nothing in these terms limits liability for death, personal injury caused by
          negligence, fraud, or anything else that can&rsquo;t legally be limited. Beyond that,
          our liability to you is limited to the amount you&rsquo;ve paid us in the 12 months
          before the issue arose. We&rsquo;re not liable for indirect or consequential losses.
        </p>
      </LegalSection>

      <LegalSection heading="11. Ending the agreement">
        <p>
          You can stop using Heimdell at any time — there&rsquo;s no subscription to cancel. We
          may suspend or close an account for breach of these terms, giving notice where
          reasonably possible except in cases of serious or urgent breach. On closure, your
          existing certificates and records remain available to you for a reasonable period to
          allow you to export what you need.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to these terms">
        <p>
          We may update these terms from time to time. We&rsquo;ll update the date at the top of
          this page when we do, and for material changes we&rsquo;ll make reasonable efforts to
          notify active client accounts directly.
        </p>
      </LegalSection>

      <LegalSection heading="13. Governing law">
        <p>
          These terms are governed by the law of England &amp; Wales, and any disputes are
          subject to the exclusive jurisdiction of the courts of England &amp; Wales.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact">
        <p>
          Questions about these terms:{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
