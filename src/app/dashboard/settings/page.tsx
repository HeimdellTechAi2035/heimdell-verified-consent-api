// Dashboard -- Settings page.

import { ClientPolicyEditor } from "@/components/dashboard/ClientPolicyEditor";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import { getClientPolicySettings } from "@/lib/client-policy";

// ---------------------------------------------------------------------------
// SettingRow -- page-local helper (not a reusable dashboard component)
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  value,
  hint,
  badge,
}: {
  label:  string;
  value:  string;
  hint?:  string;
  badge?: { text: string; style: string };
}) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-800">{label}</p>
            {badge && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.style}`}>
                {badge.text}
              </span>
            )}
          </div>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
            {value}
          </span>
          <button
            disabled
            className="text-xs text-blue-400 cursor-not-allowed"
            title="Managed setup required"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function SettingsSection({
  title,
  description,
  children,
}: {
  title:        string;
  description?: string;
  children:     React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-0.5">{title}</h3>
      {description && <p className="text-xs text-gray-400 mb-4">{description}</p>}
      {children}
    </div>
  );
}

const POLICY_MANAGER_ROLES = new Set(["CLIENT_OWNER", "CLIENT_MANAGER"]);

async function SettingsContent() {
  const context = await requireOrganizationMembership();
  const policies = await getClientPolicySettings(context);
  const canManagePolicies = POLICY_MANAGER_ROLES.has(context.membership.role);

  return (
    <>
      <DashboardHeader
        title="Settings"
        subtitle="Company details, policy wording, and verification setup."
      />

      <ClientPolicyEditor
        canManage={canManagePolicies}
        policies={policies}
      />

      {/* Organisation */}
      <SettingsSection
        title="Organisation"
        description="Your business identity as it appears on verification pages and certificates."
      >
        <SettingRow label="Organisation name" value={context.organization.name} hint="Displayed on customer and dashboard surfaces where organization context is shown." />
        <SettingRow label="Contact email" value={context.organization.primaryContactEmail ?? "Not recorded"} hint="Used for operational contact records." />
        <SettingRow label="Regulatory region" value="United Kingdom (ICO)" hint="Determines applicable consent standards and data handling rules." />
      </SettingsSection>
    </>
  );
}

export default function SettingsPage() {
  return (
    <DashboardRoleGate section="settings">
      <SettingsContent />

      {/* Branding */}
      <SettingsSection
        title="Branding"
        description="Customise the verification page shown to customers."
      >
        <SettingRow label="Logo URL"          value="Setup required"      hint="HTTPS URL to your company logo displayed on the customer verification page." />
        <SettingRow label="Primary colour"    value="#1D4ED8"             hint="Brand accent colour used on buttons and highlights." />
        <SettingRow label="Support phone"     value="Setup required"      hint="Optional support number shown in the page footer." />
        <SettingRow label="Custom footer text" value="Setup required"     hint="Short text shown below the consent form." />
      </SettingsSection>

      {/* Webhook Secret */}
      <SettingsSection
        title="Integration security"
        description="Security settings for trusted CRM connections."
      >
        <SettingRow
          label="Signing secret"
          value="••••••••••••••••"
          hint="Generated and stored securely. Only a masked value is shown after setup."
          badge={{ text: "Configured securely", style: "bg-blue-100 text-blue-700" }}
        />
        <SettingRow
          label="Signature header"
          value="x-hvcs-signature"
          hint="Used by your CRM backend to confirm messages came from Heimdell."
        />
        <SettingRow
          label="Algorithm"
          value="HMAC-SHA256"
          hint="Industry-standard signing for server-to-server messages."
        />
      </SettingsSection>

      {/* Default Session Expiry */}
      <SettingsSection
        title="Default Session Expiry"
        description="Controls how long a verification link remains valid before it expires."
      >
        <SettingRow
          label="Link expiry window"
          value="30 minutes"
          hint="From issuance time. Sessions past this threshold are marked EXPIRED and cannot be completed."
        />
        <SettingRow
          label="Expiry enforcement"
          value="Server-side"
          hint="Expiry is checked by Heimdell each time a customer opens the secure link."
        />
        <SettingRow
          label="Re-issuance"
          value="Setup required"
          hint="Create a new verification when a fresh secure link is needed."
        />
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection
        title="Notification Preferences"
        description="Configure which events trigger customer notifications and via which channel."
      >
        <SettingRow
          label="verification.link_created"
          value="Email + SMS where configured"
          hint="Sends the verification link to the customer and records delivery status."
          badge={{ text: "Setup required", style: "bg-amber-100 text-amber-700" }}
        />
        <SettingRow
          label="verification.completed"
          value="Notification record"
          hint="Records when the customer completes and confirms consent."
          badge={{ text: "Available", style: "bg-green-100 text-green-700" }}
        />
        <SettingRow
          label="certificate.created"
          value="Certificate status"
          hint="Shows when certificate evidence is available."
          badge={{ text: "Available", style: "bg-green-100 text-green-700" }}
        />
        <SettingRow
          label="SMS provider"
          value="Setup required"
          hint="Configured by Heimdell before live SMS delivery."
        />
        <SettingRow
          label="Email provider"
          value="Setup required"
          hint="Configured by Heimdell before live email delivery."
        />
      </SettingsSection>

      {/* Data Retention */}
      <SettingsSection
        title="Data Retention"
        description="Policies for how long records are retained in the database."
      >
        <SettingRow
          label="Verification sessions"
          value="90 days"
          hint="Sessions older than this may be archived. Certificates are retained permanently."
        />
        <SettingRow
          label="Notification log"
          value="30 days"
          hint="Delivery log records older than this may be purged after a successful audit export."
        />
        <SettingRow
          label="Certificates"
          value="Permanent"
          hint="Compliance certificates are never automatically deleted."
          badge={{ text: "Immutable", style: "bg-green-100 text-green-700" }}
        />
        <SettingRow
          label="Audit export"
          value="Setup required"
          hint="Heimdell can provide evidence exports for audit review."
        />
      </SettingsSection>
    </DashboardRoleGate>
  );
}
