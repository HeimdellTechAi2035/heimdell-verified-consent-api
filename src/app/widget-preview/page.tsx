"use client";

import { useEffect } from "react";
import { LegalFooter } from "@/components/LegalFooter";

// ---------------------------------------------------------------------------
// Widget preview page — shows the floating widget on a mock CRM deal page.
// Useful for demoing the widget to CRM integrators.
// ---------------------------------------------------------------------------

const DEMO_CLIENT_REF = "DEMO-PREVIEW-001";

/** Clean up all widget DOM elements injected by widget.js */
function purgeWidget() {
  ["hvcs-fab", "hvcs-overlay", "hvcs-drawer"].forEach((id) => {
    document.getElementById(id)?.remove();
  });
  // Remove the style block added by the widget
  document.querySelectorAll("style").forEach((el) => {
    if (el.textContent?.includes("hvcs-fab")) el.remove();
  });
  // Reset guards so the widget can re-initialise on the next mount
  delete (window as unknown as Record<string, unknown>).__hvcsWidget;
  delete (window as unknown as Record<string, unknown>).HeimdellWidget;
  document.body.style.overflow = "";
}

export default function WidgetPreviewPage() {
  useEffect(() => {
    // Ensure a clean slate in React strict-mode double-invocation
    purgeWidget();

    const script = document.createElement("script");
    script.src = "/widget.js";
    script.setAttribute("data-client-ref", DEMO_CLIENT_REF);
    document.body.appendChild(script);

    return () => {
      script.remove();
      purgeWidget();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f4f6] font-sans text-sm">
      <div className="flex-1">

      {/* ------------------------------------------------------------------ */}
      {/* Dev banner */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-3">
        <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
        <div className="text-xs text-amber-800 leading-relaxed">
          <strong>Widget preview</strong> — the Heimdell floating button is live in the
          bottom-right corner. Click it to open the verification drawer.{" "}
          <span className="opacity-70">
            The embed panel shows development-mode placeholder data.
          </span>
          <div className="mt-2 font-mono bg-amber-100 rounded px-2 py-1.5 text-[11px] text-amber-900 whitespace-pre-wrap break-all">
            {`<script\n  src="https://your-domain.com/widget.js"\n  data-client-ref="DEAL-123"\n></script>`}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Fake CRM top navigation */}
      {/* ------------------------------------------------------------------ */}
      <header className="bg-[#1e293b] h-11 flex items-center px-4 gap-4 text-white/80">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-sky-500 flex items-center justify-center">
            <span className="text-white font-bold text-[10px]">A</span>
          </div>
          <span className="font-semibold text-white text-xs tracking-tight">AcmeCRM</span>
        </div>
        <nav className="flex items-center gap-1 text-[11px]">
          {["Dashboard", "Deals", "Contacts", "Reports"].map((item) => (
            <span
              key={item}
              className={`px-3 py-1 rounded ${
                item === "Deals"
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              {item}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">
            JD
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Fake CRM breadcrumb + deal title bar */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border-b border-gray-200 px-5 py-3">
        <div className="text-[11px] text-gray-400 mb-1">
          Deals &rsaquo; <span className="text-gray-600">Acme Energy Ltd</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-gray-900 tracking-tight">
              Acme Energy Ltd — Gas &amp; Electric Bundle
            </h1>
            <span className="text-[10px] font-semibold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">
              Proposal Sent
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MockButton>Edit</MockButton>
            <MockButton primary>Mark Won</MockButton>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Two-column layout */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-6xl mx-auto px-5 py-5 grid grid-cols-[1fr_280px] gap-5">

        {/* Left: activity / notes */}
        <div className="space-y-4">
          {/* Deal stage pipeline */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">
              Pipeline stage
            </p>
            <div className="flex items-center gap-1">
              {["Lead In", "Qualified", "Proposal Sent", "Verbal OK", "Closed"].map(
                (stage, i) => (
                  <div key={stage} className="flex items-center gap-1 flex-1 min-w-0">
                    <div
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= 2 ? "bg-sky-500" : "bg-gray-200"
                      }`}
                    />
                    <span
                      className={`text-[10px] whitespace-nowrap ${
                        i === 2 ? "text-sky-700 font-semibold" : "text-gray-400"
                      }`}
                    >
                      {stage}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Activity log */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">
              Activity log
            </p>
            <div className="space-y-3">
              {[
                { time: "Today 14:32", type: "Call", note: "Spoke with Sarah — happy with pricing, requested T&Cs." },
                { time: "Today 10:15", type: "Email", note: "Sent Gas & Electric Bundle proposal PDF." },
                { time: "Yesterday", type: "Meeting", note: "Initial discovery call — 2 properties, dual-fuel." },
              ].map((a) => (
                <div key={a.time} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-gray-700">{a.type}</span>
                      <span className="text-[10px] text-gray-400">{a.time}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">{a.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Heimdell integration note */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Verified consent
            </p>
            <div className="rounded-md bg-gray-50 border border-dashed border-gray-300 px-4 py-5 text-center">
              <p className="text-xs text-gray-500">
                No verification started yet.
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Click the{" "}
                <span className="font-semibold text-sky-600">Verify Consent</span> button
                {" "}(bottom-right) to open the Heimdell panel.
              </p>
            </div>
          </div>
        </div>

        {/* Right: deal properties sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">
              Deal details
            </p>
            <dl className="space-y-2.5">
              {[
                ["Deal ref", DEMO_CLIENT_REF],
                ["Value", "£1,840 / yr"],
                ["Owner", "James Davies"],
                ["Close date", "30 Jun 2026"],
                ["Source", "Door to door"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-[11px] text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className="text-[11px] font-medium text-gray-800 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">
              Contact
            </p>
            <dl className="space-y-2.5">
              {[
                ["Name", "Sarah Mitchell"],
                ["Phone", "07700 900123"],
                ["Email", "s.mitchell@example.com"],
                ["Address", "14 Oak Lane, Bristol"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-[10px] text-gray-400">{label}</dt>
                  <dd className="text-[11px] font-medium text-gray-800 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Widget embed snippet */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Widget embed code
            </p>
            <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">
              Paste into your CRM&apos;s custom HTML field on the deal page.
              Replace the <code className="bg-gray-100 px-0.5 rounded">data-client-ref</code> value
              with the deal&apos;s reference field.
            </p>
            <pre className="text-[10px] bg-gray-50 rounded border border-gray-200 p-2.5 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all text-gray-700">
{`<script
  src="https://your-domain.com/widget.js"
  data-client-ref="{{deal.reference}}"
></script>`}
            </pre>
            <p className="text-[10px] text-gray-400 mt-2">
              Supports{" "}
              <code className="bg-gray-100 px-0.5 rounded">data-position=&quot;bottom-left&quot;</code>.
            </p>
          </div>
        </div>
      </div>
      </div>
      <LegalFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small local helpers for the mock CRM UI
// ---------------------------------------------------------------------------
function MockButton({
  children,
  primary = false,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      className={`text-[11px] font-medium px-3 py-1.5 rounded border transition-colors ${
        primary
          ? "bg-sky-600 text-white border-sky-600 hover:bg-sky-700"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
