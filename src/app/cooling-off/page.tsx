import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Cooling-Off & Cancellation Policy",
  description:
    "How the built-in cooling-off feature works for customers, and Heimdell's own cancellation and refund terms for client companies.",
  alternates: { canonical: "/cooling-off" },
};

export default function CoolingOffPage() {
  return (
    <LegalPageShell title="Cooling-Off & Cancellation Policy">
      <p>
        This page covers two different things — the cooling-off period a client company&rsquo;s{" "}
        <em>own customers</em> get shown on every sale, and Heimdell&rsquo;s own cancellation and
        refund terms for <em>client companies</em> using the platform.
      </p>

      <LegalSection heading="Part A — The customer-facing cooling-off feature">
        <p>
          Under the Consumer Contracts Regulations 2013, consumers who buy something at a
          distance (by phone) or off-premises (such as door to door) generally have the right to
          cancel within 14 days, without giving a reason.
        </p>
        <p>
          Every sale processed through Heimdell shows the customer a clear cooling-off summary as
          part of their verification — before they confirm anything. Each client company sets its
          own cooling-off wording and period in its account settings (defaulting to 14 days,
          adjustable per product where a different period genuinely applies), and Heimdell
          displays it automatically on every link and phone-call verification, in plain
          English, alongside the Direct Debit Guarantee wording where relevant.
        </p>
        <p>
          <strong>This is a feature of the platform, not a promise from Heimdell to the
          customer.</strong> The client company selling the product or service is responsible for
          the accuracy of their own cooling-off terms and for honouring cancellation requests —
          Heimdell&rsquo;s role is to make sure the customer was clearly shown and confirmed
          those terms.
        </p>
      </LegalSection>

      <LegalSection heading="Part B — Heimdell's own cancellation and refund terms">
        <p>
          This part applies to you if your company has signed up to use Heimdell.
        </p>
        <p>
          <strong>Cancelling your account.</strong> You can stop using Heimdell and close your
          account at any time by emailing{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>
          . Since there&rsquo;s no subscription, there&rsquo;s nothing recurring to cancel.
        </p>
        <p>
          <strong>Refunds on unused credits.</strong> As a goodwill policy (statutory cooling-off
          rights are designed for consumers, and Heimdell&rsquo;s clients are businesses), if
          you&rsquo;ve bought a credit pack within the last 14 days and haven&rsquo;t used any of
          it, we&rsquo;ll refund it in full — just email us. Credits already used to send a
          verification aren&rsquo;t refundable, since the service has already been delivered.
          Partially used packs can be refunded for the unused portion at our discretion.
        </p>
        <p>
          <strong>Account applications.</strong> If your application to sign up is declined, no
          payment will have been taken, so there&rsquo;s nothing to refund.
        </p>
        <p>
          See our{" "}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>{" "}
          for the full picture.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
