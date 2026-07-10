import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "How Heimdell processes personal data on behalf of client companies as a UK GDPR data processor.",
  alternates: { canonical: "/data-processing-agreement" },
};

const subProcessors = [
  {
    name: "Supabase",
    purpose: "Database hosting and authentication",
    location: "EU (Ireland)",
  },
  {
    name: "Stripe",
    purpose: "Payment processing for credit purchases",
    location: "US / global, with UK GDPR-standard safeguards",
  },
  {
    name: "Twilio",
    purpose: "Phone-call and SMS verification delivery",
    location: "US / global, with UK GDPR-standard safeguards",
  },
  {
    name: "Resend",
    purpose: "Transactional email delivery",
    location: "US / global, with UK GDPR-standard safeguards",
  },
];

export default function DataProcessingAgreementPage() {
  return (
    <LegalPageShell title="Data Processing Agreement">
      <p>
        This Data Processing Agreement (&ldquo;DPA&rdquo;) forms part of the agreement between
        Heimdell Tech Ai Ltd (&ldquo;Heimdell&rdquo;, &ldquo;Processor&rdquo;) and each client
        company using the platform (&ldquo;Client&rdquo;, &ldquo;Controller&rdquo;), and applies
        whenever Heimdell processes personal data on the Client&rsquo;s behalf.
      </p>

      <LegalSection heading="1. Roles">
        <p>
          The Client is the data controller for the personal data of the customers it submits to
          Heimdell for verification. Heimdell is the data processor, acting only on the
          Client&rsquo;s documented instructions (which include the ordinary operation of the
          platform as described in our{" "}
          <a href="/how-it-works" className="text-blue-600 hover:underline">
            How It Works
          </a>{" "}
          page).
        </p>
      </LegalSection>

      <LegalSection heading="2. Subject matter, duration, and purpose">
        <p>
          Heimdell processes personal data for the purpose of generating verified consent
          evidence for sales the Client submits — sending verification links or phone calls,
          recording the customer&rsquo;s confirmation or decline, and producing a tamper-evident
          certificate. Processing continues for as long as the Client&rsquo;s account is active,
          plus a reasonable retention period afterwards as described in our{" "}
          <a href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="3. Categories of data subjects and data">
        <p>
          <strong>Data subjects:</strong> the Client&rsquo;s customers who are submitted for
          verification.
        </p>
        <p>
          <strong>Categories of data:</strong> name, phone number, email address, postal address;
          product and price agreed; where relevant, bank name, sort code, and account number
          (encrypted at rest, with only the last 4 digits ever displayed); verification
          timestamp, a masked IP address, and a short device summary; the customer&rsquo;s
          confirmation or decline.
        </p>
      </LegalSection>

      <LegalSection heading="4. Heimdell's obligations">
        <ul className="list-disc space-y-1 pl-6">
          <li>Process personal data only on the Client&rsquo;s documented instructions</li>
          <li>Ensure staff and systems accessing the data are bound by confidentiality</li>
          <li>Implement appropriate technical and organisational security measures (see Section 6)</li>
          <li>Only engage sub-processors as disclosed in Section 5, and remain responsible for their compliance</li>
          <li>Assist the Client in responding to data subject rights requests and, where relevant, data protection impact assessments</li>
          <li>Notify the Client without undue delay after becoming aware of a personal data breach affecting their data</li>
          <li>Delete or return personal data at the end of the relationship, except where retention is required by law</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Sub-processors">
        <p>
          Heimdell uses the following sub-processors to run the platform. We&rsquo;ll update this
          list and make reasonable efforts to notify active clients if it changes.
        </p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 pr-4 font-semibold text-gray-900">Sub-processor</th>
                <th className="py-2 pr-4 font-semibold text-gray-900">Purpose</th>
                <th className="py-2 font-semibold text-gray-900">Location</th>
              </tr>
            </thead>
            <tbody>
              {subProcessors.map((row) => (
                <tr key={row.name} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-900">{row.name}</td>
                  <td className="py-2 pr-4 text-gray-600">{row.purpose}</td>
                  <td className="py-2 text-gray-600">{row.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Where a sub-processor is outside the UK/EEA, we rely on that provider&rsquo;s standard
          contractual clauses or equivalent UK GDPR-recognised transfer safeguards.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security measures">
        <ul className="list-disc space-y-1 pl-6">
          <li>Bank account numbers encrypted at rest using AES-256-GCM; only the last 4 digits are ever displayed</li>
          <li>Passwords and API keys stored as salted hashes, never in plain text</li>
          <li>All data in transit encrypted via HTTPS</li>
          <li>Role-based access control — staff only see data relevant to their role and organization</li>
          <li>Every certificate is cryptographically fingerprinted, so tampering is detectable</li>
          <li>Audit logging of key account and administrative actions</li>
        </ul>
      </LegalSection>

      <LegalSection heading="7. Audits">
        <p>
          On reasonable written request, and no more than once per year unless required by a
          regulator or following a security incident, Heimdell will provide the Client with
          information reasonably necessary to demonstrate compliance with this DPA.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <p>
          Questions about this DPA or a specific processing activity:{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
