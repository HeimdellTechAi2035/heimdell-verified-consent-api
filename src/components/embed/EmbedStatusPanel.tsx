"use client";

import { useEffect, useState } from "react";
import { EmbedStatusBadge, type EmbedStatus } from "@/components/embed/EmbedStatusBadge";

type EmbedMode = "verification" | "deal";

type StatusData = {
  client_reference?: string | null;
  product_name?: string | null;
  sale_status?: string | null;
  verification_status?: EmbedStatus | null;
  latest_verification_status?: EmbedStatus | null;
  created_at?: string | null;
  sale_created_at?: string | null;
  completed_at?: string | null;
  latest_verification_completed_at?: string | null;
  declined_at?: string | null;
  latest_verification_declined_at?: string | null;
  certificate_id?: string | null;
};

function formatValue(value: string | null | undefined) {
  return value || "Not recorded";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-700 text-right break-words">
        {value}
      </span>
    </div>
  );
}

export function EmbedStatusPanel({
  embedToken,
  mode,
  targetId,
}: {
  embedToken: string;
  mode: EmbedMode;
  targetId: string;
}) {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const encodedTarget = encodeURIComponent(targetId);
    const path =
      mode === "verification"
        ? `/api/v1/embed/verification/${encodedTarget}/status`
        : `/api/v1/embed/deal/${encodedTarget}/status`;

    fetch(path, {
      headers: { Authorization: `Bearer ${embedToken}` },
      credentials: "omit",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          throw new Error("Token missing, invalid, or expired.");
        }

        if (!response.ok) {
          throw new Error("Status is unavailable.");
        }

        return response.json();
      })
      .then((body) => {
        setData(body);
        setError(null);
      })
      .catch((caught) => {
        if (caught.name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "Status is unavailable.");
        }
      });

    return () => controller.abort();
  }, [embedToken, mode, targetId]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h1 className="text-sm font-semibold text-red-900">
          Consent status unavailable
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-500">Loading secure consent status...</p>
      </div>
    );
  }

  const status = data.verification_status ?? data.latest_verification_status;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-sm font-semibold text-gray-900">Consent status</h1>
        {status && <EmbedStatusBadge status={status} />}
      </div>
      <InfoRow label="Client reference" value={formatValue(data.client_reference)} />
      <InfoRow label="Product" value={formatValue(data.product_name)} />
      <InfoRow label="Sale status" value={formatValue(data.sale_status)} />
      <InfoRow
        label="Verification status"
        value={formatValue(data.verification_status ?? data.latest_verification_status)}
      />
      <InfoRow
        label="Created"
        value={formatDate(data.created_at ?? data.sale_created_at)}
      />
      <InfoRow
        label="Completed"
        value={formatDate(data.completed_at ?? data.latest_verification_completed_at)}
      />
      <InfoRow
        label="Declined"
        value={formatDate(data.declined_at ?? data.latest_verification_declined_at)}
      />
      <InfoRow label="Certificate" value={formatValue(data.certificate_id)} />
    </div>
  );
}
