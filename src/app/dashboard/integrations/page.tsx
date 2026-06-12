// Dashboard -- Integrations page.
// Integration options, CRM embed patterns, and webhook endpoint management.

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { WebhookEndpointManager } from "@/components/dashboard/WebhookEndpointManager";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import { getDashboardWebhookSettingsData } from "@/lib/dashboard-webhook-settings";

type IntegrationStatus = "available" | "setup_required";

type Integration = {
  name: string;
  category: string;
  description: string;
  status: IntegrationStatus;
  embedRoute?: string;
};

const INTEGRATIONS: Integration[] = [
  {
    name: "Webhook Delivery",
    category: "Core",
    description:
      "Signed outbound webhooks with durable retry tracking and company endpoint configuration.",
    status: "available",
  },
  {
    name: "CRM Embed -- Verification",
    category: "Embed",
    description:
      "Compact verification status panel embeddable in a CRM iframe with short-lived signed access.",
    status: "available",
    embedRoute: "/embed/verification/[sessionId]",
  },
  {
    name: "CRM Embed -- Deal",
    category: "Embed",
    description:
      "Deal-level consent status panel for CRM deal surfaces with short-lived signed access.",
    status: "available",
    embedRoute: "/embed/deal/[clientReference]",
  },
  {
    name: "SMS Provider (Twilio / etc.)",
    category: "Notifications",
    description:
      "Deliver verification links by SMS when your live notification account is configured.",
    status: "setup_required",
  },
  {
    name: "Email Provider (SendGrid / etc.)",
    category: "Notifications",
    description:
      "Deliver verification links and completion confirmations via email.",
    status: "setup_required",
  },
  {
    name: "n8n / Workflow Automation",
    category: "Automation",
    description:
      "Trigger n8n workflows on verification events via outbound webhooks.",
    status: "setup_required",
  },
];

const STATUS_LABELS: Record<IntegrationStatus, { label: string; style: string }> = {
  available: { label: "Available", style: "bg-green-100 text-green-700" },
  setup_required: { label: "Setup required", style: "bg-amber-100 text-amber-700" },
};

const CATEGORY_COLORS: Record<string, string> = {
  Core: "bg-violet-100 text-violet-700",
  Embed: "bg-blue-100 text-blue-700",
  Notifications: "bg-amber-100 text-amber-700",
  Automation: "bg-green-100 text-green-700",
};

const CRM_FIELDS = [
  { field: "hvcs_sale_id", type: "string", description: "Internal sale record ID" },
  {
    field: "hvcs_verification_session_id",
    type: "string",
    description: "Unique verification session ID",
  },
  {
    field: "hvcs_verification_status",
    type: "enum",
    description: "PENDING | OPENED | COMPLETED | DECLINED | EXPIRED",
  },
  {
    field: "hvcs_certificate_id",
    type: "string",
    description: "Certificate ID once verification completes",
  },
  {
    field: "hvcs_completed_at",
    type: "ISO 8601",
    description: "Timestamp of customer consent confirmation",
  },
  {
    field: "hvcs_declined_reason",
    type: "string",
    description: "Customer-provided decline reason if collected",
  },
  {
    field: "hvcs_last_webhook_event",
    type: "string",
    description: "Most recent webhook event received by the CRM",
  },
];

const PATTERNS = [
  {
    title: "iframe embed",
    badge: "Available",
    badgeStyle: "bg-green-100 text-green-700",
    description:
      "Embed the verification or deal status panel directly in your CRM using short-lived signed access issued by your backend.",
    code:
      '<iframe src="https://your-hvcs-domain/embed/deal/{clientReference}?embedToken={token}" width="100%" height="280" />',
  },
  {
    title: "JavaScript widget",
    badge: "Available",
    badgeStyle: "bg-green-100 text-green-700",
    description:
      "Mount the browser widget in a CRM panel using signed access from your backend. Never put a private API key in browser code.",
    code:
      '<script src="https://your-hvcs-domain/widget.js" data-mode="deal" data-target-id="{clientReference}" data-embed-token="{token}"></script>',
  },
  {
    title: "Webhook writeback",
    badge: "Core",
    badgeStyle: "bg-violet-100 text-violet-700",
    description:
      "HVCS sends signed webhook events to your CRM endpoint. Your backend verifies HMAC-SHA256 and updates CRM fields.",
    code: null,
  },
  {
    title: "Server-side API integration",
    badge: "Advanced",
    badgeStyle: "bg-blue-100 text-blue-700",
    description:
      "Connect your backend to Heimdell to initiate verifications and retrieve certificate proof records.",
    code: null,
  },
];

async function loadWebhookSettings() {
  const context = await requireOrganizationMembership();

  try {
    return await getDashboardWebhookSettingsData(context);
  } catch (error) {
    console.error("Dashboard webhook settings load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

function WebhookSettingsError() {
  return (
    <div className="mb-8 rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-red-700">
        Webhook settings unavailable
      </h3>
      <p className="mt-2 text-xs text-gray-500">
        Heimdell could not load webhook endpoint metadata right now. No secrets
        or payload data were exposed.
      </p>
    </div>
  );
}

async function IntegrationsContent() {
  const webhookSettings = await loadWebhookSettings();

  return (
    <>
      <DashboardHeader
        title="Integrations"
        subtitle="External system connections, CRM embed surfaces, and webhook writeback patterns."
      />

      {webhookSettings ? (
        <WebhookEndpointManager
          rows={webhookSettings.rows}
          canManage={webhookSettings.canManage}
        />
      ) : (
        <WebhookSettingsError />
      )}

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Integration Patterns
        </h3>
        <div className="space-y-3">
          {PATTERNS.map((pattern) => (
            <div
              key={pattern.title}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-900">
                  {pattern.title}
                </h4>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pattern.badgeStyle}`}
                >
                  {pattern.badge}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {pattern.description}
              </p>
              {pattern.code && (
                <pre className="mt-3 text-xs font-mono text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {pattern.code}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Suggested CRM Fields
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Add these custom fields to your CRM deal or contact record. Values are
          written back by your CRM backend after signed webhook events.
        </p>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Field name", "Type", "Description"].map((col) => (
                  <th
                    key={col}
                    className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {CRM_FIELDS.map((field) => (
                <tr
                  key={field.field}
                  className="hover:bg-gray-50/60 transition-colors"
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-700">
                    {field.field}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {field.type}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {field.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Provider Status
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {INTEGRATIONS.map((integration) => {
            const statusMeta = STATUS_LABELS[integration.status];
            const categoryStyle =
              CATEGORY_COLORS[integration.category] ?? "bg-gray-100 text-gray-600";
            return (
              <div
                key={integration.name}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${categoryStyle}`}
                      >
                        {integration.category}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusMeta.style}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      {integration.name}
                    </h4>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {integration.description}
                </p>
                {integration.embedRoute && (
                  <p className="text-xs font-mono text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                    {integration.embedRoute}
                  </p>
                )}
                <button
                  disabled
                  className="mt-auto self-start inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-400 rounded-lg cursor-not-allowed"
                  title="Provider configuration is not available in this phase"
                >
                  Configure
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Connecting via webhooks
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          The recommended integration pattern is outbound HMAC-SHA256 signed
          webhooks. Events fire for{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">
            verification.link_created
          </code>
          ,{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">
            verification.completed
          </code>
          ,{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">
            verification.declined
          </code>
          , and{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">
            certificate.created
          </code>
          .
        </p>
        <p className="text-xs text-gray-500">
          Configure the endpoint above, then test with{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">
            POST /api/v1/webhooks/test
          </code>
          . The signing secret is generated server-side and shown once only.
        </p>
      </div>
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <DashboardRoleGate section="integrations">
      <IntegrationsContent />
    </DashboardRoleGate>
  );
}
