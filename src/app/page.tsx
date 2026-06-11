import { LegalFooter } from "@/components/LegalFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
            Heimdell
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-gray-900">
            Verified Consent
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Secure consent verification for regulated sales teams, with
            customer review links, evidence certificates, and protected
            dashboard access.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/login"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Dashboard login
            </a>
          </div>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
