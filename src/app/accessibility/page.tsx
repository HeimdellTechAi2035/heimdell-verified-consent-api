import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "Heimdell's commitment to accessibility, and how to report an issue.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <LegalPageShell title="Accessibility Statement">
      <LegalSection heading="Our commitment">
        <p>
          We want Heimdell&rsquo;s website and dashboard to be usable by everyone, including
          people using assistive technology such as screen readers, keyboard-only navigation, or
          browser zoom. We aim to meet the{" "}
          <a
            href="https://www.w3.org/WAI/WCAG21/quickref/"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Web Content Accessibility Guidelines (WCAG) 2.1 level AA
          </a>{" "}
          as our standard.
        </p>
      </LegalSection>

      <LegalSection heading="What we've done">
        <ul className="list-disc space-y-1 pl-6">
          <li>Semantic HTML headings and landmarks throughout the site and dashboard</li>
          <li>Keyboard-operable navigation, forms, and menus</li>
          <li>Text alternatives for icons and images that convey information</li>
          <li>Colour choices checked for reasonable contrast against their background</li>
          <li>Forms with visible labels and clear error messages</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Known limitations">
        <p>
          This is an honest, ongoing statement rather than a claim of full compliance — we
          haven&rsquo;t yet had a full third-party accessibility audit. If you come across
          anything that doesn&rsquo;t work well with the technology you use, we genuinely want to
          know so we can fix it.
        </p>
      </LegalSection>

      <LegalSection heading="Reporting an accessibility issue">
        <p>
          Email{" "}
          <a href="mailto:andrew@heimdell-tech-ai.co.uk" className="text-blue-600 hover:underline">
            andrew@heimdell-tech-ai.co.uk
          </a>{" "}
          with what you were trying to do, the page or feature involved, and the browser or
          assistive technology you were using. We&rsquo;ll acknowledge your report the same way
          we handle any complaint — see our{" "}
          <a href="/complaints" className="text-blue-600 hover:underline">
            Complaints Policy
          </a>{" "}
          for our response timeframes.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
