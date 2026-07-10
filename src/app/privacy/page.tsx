import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Heimdell Tech Ai Ltd collects, uses, and protects personal data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <LegalSection heading="Who we are">
        <p>
          Heimdell Verified Consent is operated by Heimdell Tech Ai Ltd (&ldquo;Heimdell&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;), a company registered in England &amp; Wales
          (Company No. 16478408), registered with the Information Commissioner&rsquo;s Office
          (ICO Reg: ZC079121). You can contact us about privacy at{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="The two kinds of people this policy covers">
        <p>
          Heimdell sits between sales companies (our <strong>clients</strong>) and their{" "}
          <strong>customers</strong>. Depending on who you are, we handle your data differently:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>If you visit our website, apply to sign up, or use our dashboard</strong> —
            we are the <strong>controller</strong> of your data and this policy explains what we
            do with it directly.
          </li>
          <li>
            <strong>If you are a customer of one of our clients</strong> (someone who received a
            verification link or phone call about a sale) — our client is the{" "}
            <strong>controller</strong> of your data, and we act as their{" "}
            <strong>processor</strong>, handling it only on their instructions. This policy still
            explains what we do with it and how to exercise your rights, but you should also
            check the sales company&rsquo;s own privacy policy.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we collect, and why">
        <p>
          <strong>Website visitors and applicants.</strong> If you fill in our contact form or
          apply to sign up your company, we collect your name, email, company name, and message
          or application details (including, for signup applications, your Companies House
          number, ICO registration number, business address, and contact phone number). We use
          this to reply to you and, for signups, to manually review whether to approve your
          company for access. Legal basis: taking steps at your request before entering a
          contract, and our legitimate interest in responding to enquiries.
        </p>
        <p>
          <strong>Dashboard users (client staff and sellers).</strong> We hold your name, email
          address, and role. We use this to authenticate you, control what you can see, and keep
          a record of who did what for audit purposes. Legal basis: performance of our contract
          with the client company you work for.
        </p>
        <p>
          <strong>Customers being verified.</strong> When a client submits a sale, we hold the
          customer&rsquo;s name, phone number, email, address, the product and price agreed, and
          — where a Direct Debit is involved — bank name, sort code, and account number (the full
          account number is encrypted; only the last 4 digits are ever shown to anyone,
          including our own staff). When the customer confirms a verification, we also record the
          time, a masked version of their IP address, a short summary of their device (e.g.
          &ldquo;Chrome on Windows&rdquo;), and their confirmation or decline. Legal basis: this
          is processed by us on behalf of, and under the instructions of, the client company
          (see the Data Processing Agreement below) — the client&rsquo;s own legal basis for
          collecting it is between them and their customer.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep data">
        <p>
          Verification records and certificates are kept for as long as the client company&rsquo;s
          account is active, because their entire purpose is to serve as evidence if a sale is
          later disputed. If a client account is closed, we retain records for a reasonable
          period to meet legal and regulatory obligations before deletion. Website enquiry and
          signup application data not resulting in an account is kept for up to 24 months.
        </p>
      </LegalSection>

      <LegalSection heading="Who we share data with">
        <p>
          We use a small number of trusted service providers (&ldquo;sub-processors&rdquo;) to
          run Heimdell. Full details are in our{" "}
          <Link href="/data-processing-agreement" className="text-blue-600 hover:underline">
            Data Processing Agreement
          </Link>
          , but in summary: Supabase (database hosting, EU), Stripe (payment processing), Twilio
          (phone calls and SMS), and Resend (email delivery). We do not sell personal data to
          anyone, ever.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Bank account numbers are encrypted at rest (AES-256-GCM). Passwords and API keys are
          hashed, never stored in plain text. All traffic to our platform is encrypted in
          transit (HTTPS). Access to customer data in the dashboard is restricted by role, so
          staff only see what&rsquo;s relevant to their job. Every certificate is fingerprinted
          with a cryptographic hash so tampering after the fact is detectable.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>Under UK GDPR, you have the right to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Ask what personal data we hold about you and get a copy of it</li>
          <li>Ask us to correct inaccurate data</li>
          <li>Ask us to delete your data, where we&rsquo;re not required to keep it</li>
          <li>Object to or restrict certain processing</li>
          <li>Ask for your data in a portable format</li>
        </ul>
        <p>
          To exercise any of these, email{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>
          . If you were verified by one of our clients and want to exercise your rights over that
          data, we recommend contacting them directly too, since they control why the data was
          collected in the first place. You also have the right to complain to the{" "}
          <a
            href="https://ico.org.uk"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Information Commissioner&rsquo;s Office
          </a>{" "}
          if you&rsquo;re unhappy with how we&rsquo;ve handled your data.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          See our{" "}
          <Link href="/cookies" className="text-blue-600 hover:underline">
            Cookies Policy
          </Link>{" "}
          for details on the (very few) cookies we use.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>Heimdell is a business-to-business service and is not directed at children.</p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We&rsquo;ll update this page if how we handle data changes, and update the date at the
          top.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
