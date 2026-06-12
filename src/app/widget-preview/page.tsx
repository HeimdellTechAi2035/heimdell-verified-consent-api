"use client";

import { useEffect } from "react";
import { LegalFooter } from "@/components/LegalFooter";

const PREVIEW_CLIENT_ID = "client_id_from_crm_backend";
const PREVIEW_CLIENT_REF = "HVCS-PILOT-001";

function purgeWidget() {
  ["hvcs-fab", "hvcs-overlay", "hvcs-drawer"].forEach((id) => {
    document.getElementById(id)?.remove();
  });

  document.querySelectorAll("style").forEach((el) => {
    if (el.textContent?.includes("hvcs-fab")) {
      el.remove();
    }
  });

  delete (window as unknown as Record<string, unknown>).__hvcsWidget;
  delete (window as unknown as Record<string, unknown>).HeimdellWidget;
  document.body.style.overflow = "";
}

export default function WidgetPreviewPage() {
  useEffect(() => {
    purgeWidget();

    const script = document.createElement("script");
    script.src = "/widget.js";
    script.setAttribute("data-mode", "create");
    script.setAttribute("data-target-id", PREVIEW_CLIENT_ID);
    script.setAttribute("data-container", "#heimdell-embed-preview");
    document.body.appendChild(script);

    return () => {
      script.remove();
      purgeWidget();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 font-sans text-sm text-gray-900">
      <main className="flex-1">
        <section className="border-b border-blue-200 bg-blue-50 px-5 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                CRM integration preview
              </p>
              <h1 className="mt-1 text-xl font-semibold text-gray-950">
                Embedded Heimdell verification workflow
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-blue-900">
                This preview shows how a CRM can open Heimdell inside a deal
                record, send a secure verification, refresh status, and link to
                the certificate when the customer completes.
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-white px-4 py-3 text-xs text-blue-900">
              Private API keys stay on the CRM backend. The browser receives
              only short-lived signed access.
            </div>
          </div>
        </section>

        <header className="flex h-12 items-center gap-4 bg-slate-800 px-5 text-white/80">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-500 text-xs font-bold text-white">
              C
            </div>
            <span className="text-xs font-semibold text-white">CRM Workspace</span>
          </div>
          <nav className="flex items-center gap-1 text-xs">
            {["Dashboard", "Deals", "Contacts", "Reports"].map((item) => (
              <span
                key={item}
                className={`rounded px-3 py-1 ${
                  item === "Deals"
                    ? "bg-white/10 text-white"
                    : "text-white/60"
                }`}
              >
                {item}
              </span>
            ))}
          </nav>
        </header>

        <div className="border-b border-gray-200 bg-white px-5 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs text-gray-500">
                Deals / {PREVIEW_CLIENT_REF}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-950">
                Sarah Mitchell - Energy switching agreement
              </h2>
            </div>
            <span className="self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 md:self-auto">
              Verification required
            </span>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800">
                CRM deal stage
              </h3>
              <div className="mt-4 grid gap-2 md:grid-cols-5">
                {["Lead", "Qualified", "Proposal", "Verify", "Complete"].map(
                  (stage, index) => (
                    <div key={stage} className="min-w-0">
                      <div
                        className={`h-2 rounded-full ${
                          index <= 3 ? "bg-sky-500" : "bg-gray-200"
                        }`}
                      />
                      <p
                        className={`mt-2 text-xs ${
                          index === 3
                            ? "font-semibold text-sky-700"
                            : "text-gray-500"
                        }`}
                      >
                        {stage}
                      </p>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800">
                Heimdell embedded panel
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                In a configured CRM, the backend supplies the client ID and
                signed access, then this panel opens the real embedded
                verification form.
              </p>
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                <div id="heimdell-embed-preview" />
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800">
                Expected CRM flow
              </h3>
              <ol className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  "CRM opens the Heimdell embed for the deal.",
                  "Seller enters customer, product, and payment details.",
                  "Seller sends the secure verification link.",
                  "Status refreshes to Pending, Completed, Declined, or Expired.",
                  "Certificate link appears when the customer completes.",
                  "CRM stores the Heimdell sale, session, status, and certificate fields.",
                ].map((item, index) => (
                  <li
                    key={item}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600"
                  >
                    <span className="font-semibold text-gray-900">
                      {index + 1}.
                    </span>{" "}
                    {item}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="space-y-5">
            <PreviewCard title="Customer">
              <PreviewRow label="Name" value="Sarah Mitchell" />
              <PreviewRow label="Phone" value="07700 900123" />
              <PreviewRow label="Email" value="s.mitchell@example.com" />
              <PreviewRow label="Address" value="14 Oak Lane, Bristol" />
            </PreviewCard>

            <PreviewCard title="Sale">
              <PreviewRow label="Reference" value={PREVIEW_CLIENT_REF} />
              <PreviewRow label="Product" value="Energy switching agreement" />
              <PreviewRow label="Price" value="GBP 49.99 / month" />
              <PreviewRow label="Channel" value="Door to door" />
            </PreviewCard>

            <PreviewCard title="Secure embed setup">
              <p className="text-xs leading-relaxed text-gray-500">
                Add the widget to a CRM deal page and have your backend inject
                short-lived signed access for the correct client.
              </p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
{`<script
  src="https://your-domain.com/widget.js"
  data-mode="create"
  data-target-id="{{heimdell_client_id}}"
  data-embed-token="{{signed_embed_access}}"
></script>`}
              </pre>
            </PreviewCard>
          </aside>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

function PreviewCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
