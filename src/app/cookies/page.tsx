import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Cookies Policy",
  description: "The cookies Heimdell uses — and the ones it doesn't.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPageShell title="Cookies Policy">
      <LegalSection heading="The short version">
        <p>
          Heimdell only uses one type of cookie: the one that keeps you signed in to the
          dashboard. We don&rsquo;t use analytics cookies, advertising cookies, or any third-party
          tracking cookies on this site.
        </p>
      </LegalSection>

      <LegalSection heading="Strictly necessary cookies">
        <p>
          When you sign in to the Heimdell dashboard, our authentication provider (Supabase)
          sets a cookie on your browser to remember that you&rsquo;re signed in, so you
          don&rsquo;t have to log in again on every page. This cookie is essential for the
          dashboard to work at all — without it, you couldn&rsquo;t stay logged in.
        </p>
        <p>
          Because this cookie is strictly necessary for a service you&rsquo;ve asked for (being
          logged in), UK cookie law (PECR) doesn&rsquo;t require us to ask your permission for
          it, the same way it wouldn&rsquo;t for a shopping basket on an online store. That&rsquo;s
          why you won&rsquo;t see a cookie consent pop-up asking you to accept or reject
          cookies — there&rsquo;s nothing optional to accept or reject.
        </p>
      </LegalSection>

      <LegalSection heading="What we don't use">
        <p>
          No Google Analytics, no advertising pixels, no cross-site tracking, no cookies that
          follow you around the web. If that ever changes, we&rsquo;ll update this page and add a
          proper consent banner before any non-essential cookie is set.
        </p>
      </LegalSection>

      <LegalSection heading="Controlling cookies">
        <p>
          You can clear or block cookies at any time in your browser settings. Blocking the
          sign-in cookie will simply mean you can&rsquo;t stay logged in to the dashboard.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
