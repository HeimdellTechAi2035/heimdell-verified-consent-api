// VerificationStatusCard -- status-aware panel for the embed verification widget.
// Renders different content, messages, and actions depending on session status.
// Used inside /embed/verification/[sessionId]/page.tsx.
// Imports client component EmbedActionButton -- this component stays server-side.

import { EmbedStatusBadge, type EmbedStatus } from "./EmbedStatusBadge";
import { EmbedInfoRow } from "./EmbedInfoRow";
import { EmbedActionButton } from "./EmbedActionButton";
import { EmbedTimeline, type TimelineStep } from "./EmbedTimeline";

export type VerificationStatusCardProps = {
  sessionId:             string;
  clientReference:       string;
  customerName:          string;
  productName:           string;
  subscriptionPrice:     string;
  subscriptionFrequency: string;
  status:                EmbedStatus;
  verificationUrl:       string;
  expiresAt:             string | null;
  openedAt:              string | null;
  completedAt:           string | null;
  declinedAt:            string | null;
  certificateId:         string | null;
  declinedReason:        string | null;
};

const STATUS_DESCRIPTION: Record<EmbedStatus, string> = {
  PENDING:
    "Waiting for customer verification. Share the link below or copy it for the customer.",
  OPENED:
    "Customer has opened the verification page and is reviewing the details.",
  COMPLETED:
    "Customer has confirmed consent. A compliance certificate has been generated.",
  DECLINED:
    "The customer declined to provide consent. Review the reason below and follow up if appropriate.",
  EXPIRED:
    "The verification link expired before the customer completed or declined.",
};

const STATUS_DESCRIPTION_STYLE: Record<EmbedStatus, string> = {
  PENDING:   "bg-gray-50 text-gray-500",
  OPENED:    "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  DECLINED:  "bg-red-50 text-red-700",
  EXPIRED:   "bg-amber-50 text-amber-700",
};

export function VerificationStatusCard(props: VerificationStatusCardProps) {
  const {
    sessionId,
    clientReference,
    customerName,
    productName,
    subscriptionPrice,
    subscriptionFrequency,
    status,
    verificationUrl,
    expiresAt,
    openedAt,
    completedAt,
    declinedAt,
    certificateId,
    declinedReason,
  } = props;

  // ---------------------------------------------------------------------------
  // Build timeline steps
  // ---------------------------------------------------------------------------

  const saleSubmitted: TimelineStep = {
    label:     "Sale submitted",
    timestamp: "Not recorded",
    status:    "done",
  };
  const linkCreated: TimelineStep = {
    label:     "Verification link created",
    timestamp: expiresAt ? `Expires ${expiresAt}` : null,
    status:    "done",
  };
  const customerOpened: TimelineStep = {
    label:     "Customer opened",
    timestamp: openedAt,
    status:    openedAt
      ? "done"
      : status === "PENDING"
      ? "active"
      : "pending",
  };
  const finalStep: TimelineStep = {
    label:
      status === "DECLINED"
        ? "Declined"
        : status === "EXPIRED"
        ? "Expired"
        : "Completed",
    timestamp: completedAt ?? declinedAt,
    status:
      completedAt || declinedAt
        ? "done"
        : status === "OPENED"
        ? "active"
        : "pending",
  };

  const timelineSteps: TimelineStep[] = [
    saleSubmitted,
    linkCreated,
    customerOpened,
    finalStep,
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Customer + status header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {customerName}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {productName} &middot; {subscriptionPrice}/{subscriptionFrequency}
          </p>
          <p className="text-xs font-mono text-gray-400 mt-0.5">{clientReference}</p>
        </div>
        <EmbedStatusBadge status={status} />
      </div>

      {/* Status description */}
      <div
        className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${STATUS_DESCRIPTION_STYLE[status]}`}
      >
        {STATUS_DESCRIPTION[status]}
      </div>

      {/* Session detail rows */}
      <div className="bg-white rounded-xl border border-gray-100 px-3 py-1">
        <EmbedInfoRow label="Session ID" value={sessionId} mono />
        {expiresAt    && <EmbedInfoRow label="Expires"     value={expiresAt} />}
        {openedAt     && <EmbedInfoRow label="Opened"      value={openedAt} />}
        {completedAt  && <EmbedInfoRow label="Completed"   value={completedAt} />}
        {declinedAt   && <EmbedInfoRow label="Declined"    value={declinedAt} />}
        {certificateId && (
          <EmbedInfoRow label="Certificate" value={certificateId} mono />
        )}
        {declinedReason && (
          <EmbedInfoRow label="Reason" value={declinedReason} />
        )}
      </div>

      {/* Timeline */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Timeline
        </p>
        <EmbedTimeline steps={timelineSteps} />
      </div>

      {/* Status-specific actions */}
      <div className="space-y-2 pt-1">
        {/* PENDING or OPENED */}
        {(status === "PENDING" || status === "OPENED") && (
          <>
            <EmbedActionButton variant="primary" copyText={verificationUrl}>
              Copy verification link
            </EmbedActionButton>
            <div className="grid grid-cols-2 gap-2">
              <EmbedActionButton
                variant="secondary"
                disabled
                title="Opens in a new tab (requires live URL)"
              >
                Open customer page
              </EmbedActionButton>
              <EmbedActionButton
                variant="secondary"
                disabled
                title="Status refresh is handled by the production widget"
              >
                Refresh status
              </EmbedActionButton>
            </div>
            <EmbedActionButton
              variant="ghost"
              disabled
              title="Only available after verification is completed"
            >
              View certificate
            </EmbedActionButton>
          </>
        )}

        {/* COMPLETED */}
        {status === "COMPLETED" && (
          <div className="grid grid-cols-2 gap-2">
            <EmbedActionButton
              variant="primary"
              disabled={!certificateId}
              title={
                certificateId
                  ? "View compliance certificate"
                  : "Certificate not yet available"
              }
            >
              View certificate
            </EmbedActionButton>
            <EmbedActionButton
              variant="secondary"
              disabled
              title="Status refresh is handled by the production widget"
            >
              Refresh status
            </EmbedActionButton>
          </div>
        )}

        {/* DECLINED */}
        {status === "DECLINED" && (
          <div className="grid grid-cols-2 gap-2">
            <EmbedActionButton
              variant="primary"
              disabled
              title="Restart action is not available in this embed panel"
            >
              Restart verification
            </EmbedActionButton>
            <EmbedActionButton
              variant="secondary"
              disabled
              title="Status refresh is handled by the production widget"
            >
              Refresh status
            </EmbedActionButton>
          </div>
        )}

        {/* EXPIRED */}
        {status === "EXPIRED" && (
          <EmbedActionButton variant="primary" disabled title="Start-new action is not available in this embed panel">
            Start new verification
          </EmbedActionButton>
        )}
      </div>
    </div>
  );
}
