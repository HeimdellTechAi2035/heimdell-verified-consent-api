import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";

export const LEGAL_LAST_UPDATED = "10 July 2026";

export function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <MarketingHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Draft for review.</strong> This page describes how Heimdell actually works
            today, but has not yet been reviewed by a solicitor. Please don&rsquo;t treat it as
            final legal advice.
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {LEGAL_LAST_UPDATED}</p>

          <article className="prose-legal mt-8 space-y-6 text-sm leading-6 text-gray-700">
            {children}
          </article>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
