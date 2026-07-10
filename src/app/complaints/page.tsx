import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Complaints Policy",
  description: "How to raise a complaint with Heimdell, and what happens next.",
  alternates: { canonical: "/complaints" },
};

export default function ComplaintsPage() {
  return (
    <LegalPageShell title="Complaints Policy">
      <LegalSection heading="Who this is for">
        <p>
          This applies whether you&rsquo;re a client company using Heimdell, or a customer who
          received a verification link or phone call about a sale made by one of our clients.
        </p>
      </LegalSection>

      <LegalSection heading="How to complain">
        <p>
          Email{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>{" "}
          with as much detail as you can: what happened, when, and (if relevant) the sale
          reference, certificate ID, or company name involved.
        </p>
        <p>
          If your complaint is actually about a specific sale, product, or the way you were sold
          to — rather than about Heimdell&rsquo;s platform itself — we&rsquo;ll usually need to
          pass it to the client company involved, since they&rsquo;re responsible for the sale.
          We&rsquo;ll tell you if that&rsquo;s the case.
        </p>
      </LegalSection>

      <LegalSection heading="What happens next">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>We&rsquo;ll acknowledge your complaint within 3 working days.</strong>
          </li>
          <li>
            <strong>We aim to resolve most complaints within 14 days.</strong> If it&rsquo;s more
            complex, we&rsquo;ll tell you why and give a revised timeframe.
          </li>
          <li>
            We&rsquo;ll keep a record of every complaint, what we found, and what we did about
            it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="If you're not satisfied">
        <p>
          If your complaint is about how we&rsquo;ve handled your personal data and you&rsquo;re
          not satisfied with our response, you can complain to the{" "}
          <a
            href="https://ico.org.uk/make-a-complaint/"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Information Commissioner&rsquo;s Office
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
