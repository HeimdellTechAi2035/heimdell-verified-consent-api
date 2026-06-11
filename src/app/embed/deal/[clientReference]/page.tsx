import type { Metadata } from "next";
import { EmbedShell } from "@/components/embed/EmbedShell";
import { EmbedStatusPanel } from "@/components/embed/EmbedStatusPanel";

export const metadata: Metadata = {
  title: "Deal Consent Status -- Heimdell",
};

type Props = {
  params: Promise<{ clientReference: string }>;
  searchParams?: Promise<{ embedToken?: string }>;
};

function TokenRequiredPanel({ clientReference }: { clientReference: string }) {
  return (
    <EmbedShell title="Deal">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h1 className="text-sm font-semibold text-amber-900">
          Signed embed token required
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-amber-800">
          This deal panel no longer exposes unauthenticated preview data. Your
          CRM backend must request a short-lived embed token for reference{" "}
          <span className="font-mono">{clientReference}</span> and pass it to
          this iframe as <span className="font-mono">embedToken</span>.
        </p>
      </div>
    </EmbedShell>
  );
}

export default async function DealEmbedPage({ params, searchParams }: Props) {
  const { clientReference } = await params;
  const token = (await searchParams)?.embedToken;

  if (!token) {
    return <TokenRequiredPanel clientReference={clientReference} />;
  }

  return (
    <EmbedShell title="Deal">
      <EmbedStatusPanel
        embedToken={token}
        mode="deal"
        targetId={clientReference}
      />
    </EmbedShell>
  );
}
