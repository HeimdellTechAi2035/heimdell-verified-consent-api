import type { Metadata } from "next";
import { EmbedShell } from "@/components/embed/EmbedShell";
import { EmbedVerificationWorkflow } from "@/components/embed/EmbedVerificationWorkflow";
import { getAllowedEmbedRequestOrigins } from "@/lib/embed-origin";

export const metadata: Metadata = {
  title: "New Verification -- Heimdell",
};

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ embedToken?: string; parentOrigin?: string }>;
};

function TokenRequiredPanel({ clientId }: { clientId: string }) {
  return (
    <EmbedShell title="New verification">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h1 className="text-sm font-semibold text-amber-900">
          Signed embed token required
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-amber-800">
          Your CRM backend must request a short-lived{" "}
          <span className="font-mono">verification_create</span> token for
          client <span className="font-mono">{clientId}</span>. Do not expose
          API keys in browser code.
        </p>
      </div>
    </EmbedShell>
  );
}

export default async function NewVerificationEmbedPage({
  params,
  searchParams,
}: Props) {
  const { clientId } = await params;
  const resolvedSearchParams = await searchParams;
  const token = resolvedSearchParams?.embedToken;
  const requestedParentOrigin = resolvedSearchParams?.parentOrigin ?? null;
  const parentOrigin =
    requestedParentOrigin &&
    getAllowedEmbedRequestOrigins().includes(requestedParentOrigin)
      ? requestedParentOrigin
      : null;

  if (!token) {
    return <TokenRequiredPanel clientId={clientId} />;
  }

  return (
    <EmbedShell title="New verification">
      <EmbedVerificationWorkflow
        clientId={clientId}
        embedToken={token}
        parentOrigin={parentOrigin}
      />
    </EmbedShell>
  );
}
