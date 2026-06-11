import type { Metadata } from "next";
import { EmbedShell } from "@/components/embed/EmbedShell";
import { EmbedStatusPanel } from "@/components/embed/EmbedStatusPanel";

export const metadata: Metadata = {
  title: "Verification Status -- Heimdell",
};

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ embedToken?: string }>;
};

function TokenRequiredPanel({ sessionId }: { sessionId: string }) {
  return (
    <EmbedShell title="Verification">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h1 className="text-sm font-semibold text-amber-900">
          Signed embed token required
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-amber-800">
          This verification panel no longer exposes unauthenticated preview
          data. Your CRM backend must request a short-lived embed token for
          session <span className="font-mono">{sessionId}</span> and pass it to
          this iframe as <span className="font-mono">embedToken</span>.
        </p>
      </div>
    </EmbedShell>
  );
}

export default async function VerificationEmbedPage({
  params,
  searchParams,
}: Props) {
  const { sessionId } = await params;
  const token = (await searchParams)?.embedToken;

  if (!token) {
    return <TokenRequiredPanel sessionId={sessionId} />;
  }

  return (
    <EmbedShell title="Verification">
      <EmbedStatusPanel
        embedToken={token}
        mode="verification"
        targetId={sessionId}
      />
    </EmbedShell>
  );
}
