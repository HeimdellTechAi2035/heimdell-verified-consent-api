"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { EmbedStatusBadge, type EmbedStatus } from "@/components/embed/EmbedStatusBadge";
import { EmbedActionButton } from "@/components/embed/EmbedActionButton";

type Created = {
  sale_id: string;
  client_reference: string;
  verification_session_id: string;
  verification_status: EmbedStatus;
  expires_at: string;
  verification_url: string;
  status_embed_token: string;
  certificate_id: string | null;
};

type StatusData = {
  verification_status?: EmbedStatus | null;
  latest_verification_status?: EmbedStatus | null;
  completed_at?: string | null;
  latest_verification_completed_at?: string | null;
  declined_at?: string | null;
  latest_verification_declined_at?: string | null;
  certificate_id?: string | null;
  certificate_url?: string | null;
};

const FIELDS = {
  clientReference: "CRM-DEAL-123",
  sellerReference: "seller-001",
  customerFullName: "Sarah Mitchell",
  customerPhone: "07700900123",
  customerEmail: "sarah@example.com",
  customerAddress: "14 Oak Lane, Bristol",
  productName: "Gas and Electric Bundle",
  subscriptionPrice: "49.99",
  subscriptionFrequency: "month",
  contractLength: "12 months",
  termsSummary: "Monthly subscription for the selected energy bundle.",
  policiesSummary: "Standard cancellation, privacy, evidence, and payment policies apply.",
  bankName: "Example Bank",
  sortCode: "123456",
  accountNumber: "",
  accountHolderName: "Sarah Mitchell",
};

function inputClass() {
  return "w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900 outline-none focus:border-blue-400";
}

function postSafeEvent(parentOrigin: string | null, type: string, payload: object) {
  if (!parentOrigin || typeof window === "undefined" || window.parent === window) {
    return;
  }

  window.parent.postMessage({ type, payload }, parentOrigin);
}

export function EmbedVerificationWorkflow({
  clientId,
  embedToken,
  parentOrigin,
}: {
  clientId: string;
  embedToken: string;
  parentOrigin: string | null;
}) {
  const [created, setCreated] = useState<Created | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const currentStatus = useMemo(
    () =>
      status?.verification_status ??
      status?.latest_verification_status ??
      created?.verification_status ??
      null,
    [created, status]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const body = {
      clientReference: String(formData.get("clientReference") ?? ""),
      sellerReference: String(formData.get("sellerReference") ?? ""),
      customer: {
        fullName: String(formData.get("customerFullName") ?? ""),
        phone: String(formData.get("customerPhone") ?? ""),
        email: String(formData.get("customerEmail") ?? "") || null,
        address: String(formData.get("customerAddress") ?? ""),
      },
      product: {
        name: String(formData.get("productName") ?? ""),
        subscriptionPrice: String(formData.get("subscriptionPrice") ?? ""),
        subscriptionFrequency: String(formData.get("subscriptionFrequency") ?? ""),
        contractLength: String(formData.get("contractLength") ?? "") || null,
        termsSummary: String(formData.get("termsSummary") ?? ""),
        policiesSummary: String(formData.get("policiesSummary") ?? ""),
        salesChannel: String(formData.get("salesChannel") ?? "field_sales"),
      },
      payment: {
        bankName: String(formData.get("bankName") ?? ""),
        sortCode: String(formData.get("sortCode") ?? ""),
        accountNumber: String(formData.get("accountNumber") ?? ""),
        accountHolderName: String(formData.get("accountHolderName") ?? ""),
      },
      consent: {
        coolingOffDays: 14,
        aiMarketingOptIn: false,
      },
    };

    try {
      const response = await fetch(`/api/v1/embed/verifications?clientId=${encodeURIComponent(clientId)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${embedToken}`,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify(body),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json?.error?.message ?? "Verification could not be created.");
      }

      setCreated(json);
      setStatus({ verification_status: json.verification_status, certificate_id: null });
      postSafeEvent(parentOrigin, "heimdell:verification_created", {
        sale_id: json.sale_id,
        verification_session_id: json.verification_session_id,
        verification_status: json.verification_status,
        verification_url: json.verification_url,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification could not be created.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!created) return;

    let cancelled = false;
    const createdVerification = created;
    async function refresh() {
      const response = await fetch(
        `/api/v1/embed/verification/${encodeURIComponent(createdVerification.verification_session_id)}/status`,
        {
          headers: { Authorization: `Bearer ${createdVerification.status_embed_token}` },
          credentials: "omit",
        }
      );
      if (!response.ok) return;
      const json = await response.json();
      if (cancelled) return;

      setStatus(json);
      postSafeEvent(parentOrigin, "heimdell:verification_status_changed", {
        sale_id: json.sale_id,
        verification_session_id: json.session_id,
        verification_status: json.verification_status,
        certificate_id: json.certificate_id,
        certificate_url: json.certificate_url,
        completed_at: json.completed_at,
        declined_at: json.declined_at,
      });

      if (json.certificate_id) {
        postSafeEvent(parentOrigin, "heimdell:certificate_available", {
          certificate_id: json.certificate_id,
          verification_session_id: json.session_id,
        });
      }
    }

    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [created, parentOrigin]);

  if (created) {
    return (
      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm font-semibold text-gray-900">Verification created</h1>
          {currentStatus && <EmbedStatusBadge status={currentStatus} />}
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Verification link</p>
          <p className="mt-1 break-all font-mono text-xs text-gray-800">
            {created.verification_url}
          </p>
        </div>
        <EmbedActionButton variant="primary" copyText={created.verification_url}>
          Copy verification link
        </EmbedActionButton>
        <div className="grid gap-2 text-xs text-gray-600">
          <p>Sale: {created.sale_id}</p>
          <p>Session: {created.verification_session_id}</p>
          <p>Certificate: {status?.certificate_id ?? "Not available yet"}</p>
          <p>Certificate URL: {status?.certificate_url ?? "Not available yet"}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(FIELDS).map(([name, value]) => (
          <label key={name} className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {name.replace(/[A-Z]/g, " $&")}
            </span>
            <input
              className={inputClass()}
              defaultValue={value}
              name={name}
              required={!["sellerReference", "customerEmail", "contractLength"].includes(name)}
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Sales channel
          </span>
          <select className={inputClass()} defaultValue="field_sales" name="salesChannel">
            <option value="door_to_door">Door to door</option>
            <option value="phone">Phone</option>
            <option value="in_store">In store</option>
            <option value="online">Online</option>
            <option value="field_sales">Field sales</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <button
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending..." : "Send Verification"}
      </button>
    </form>
  );
}
