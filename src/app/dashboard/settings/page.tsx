// Dashboard -- Settings page (Phase 12C).
// Expanded sections: Organisation, Branding, Webhook Secret, Session Expiry,
// Notification Preferences, Data Retention, Environment Status, Danger Zone.
// Settings remain read-only until a dedicated settings management phase.

import { DevelopmentPreviewBanner } from "@/components/dashboard/DevelopmentPreviewBanner";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";

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
            title="Settings updates are not available yet"
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

export default function SettingsPage() {
  return (
    <DashboardRoleGate section="settings">
      <DevelopmentPreviewBanner message="Live configuration will be available after database and authentication are connected." />

      <DashboardHeader
        title="Settings"
        subtitle="Application configuration. All values shown are defaults -- edit requires authentication."
      />

      {/* Organisation */}
      <SettingsSection
        title="Organisation"
        description="Your business identity as it appears on verification pages and certificates."
      >
        <SettingRow label="Organisation name" value="Heimdell Demo Org"    hint="Displayed on the customer verification page header." />
        <SettingRow label="Contact email"     value="admin@example.com"    hint="Used for system notifications and compliance queries." />
        <SettingRow label="Regulatory region" value="United Kingdom (ICO)" hint="Determines applicable consent standards and data handling rules." />
      </SettingsSection>

      {/* Branding */}
      <SettingsSection
        title="Branding"
        description="Customise the verification page shown to customers."
      >
        <SettingRow label="Logo URL"          value="(not set)"           hint="HTTPS URL to your company logo displayed on /v/[token]." />
        <SettingRow label="Primary colour"    value="#1D4ED8"             hint="Brand accent colour used on buttons and highlights." />
        <SettingRow label="Support phone"     value="(not set)"           hint="Optional support number shown in the page footer." />
        <SettingRow label="Custom footer text" value="(not set)"          hint="Short text shown below the consent form." />
      </SettingsSection>

      {/* Webhook Secret */}
      <SettingsSection
        title="Webhook Secret"
        description="Used to sign outbound webhook payloads with HMAC-SHA256."
      >
        <SettingRow
          label="Webhook secret"
          value="••••••••••••••••"
          hint="Set per-client as webhookSecret on the Client record. Used to compute x-hvcs-signature."
          badge={{ text: "Per-client", style: "bg-blue-100 text-blue-700" }}
        />
        <SettingRow
          label="Signature header"
          value="x-hvcs-signature"
          hint="Verify this header value in your CRM webhook handler using HMAC-SHA256."
        />
        <SettingRow
          label="Algorithm"
          value="HMAC-SHA256"
          hint="Industry standard. Compare the hex digest of the raw body against the header value."
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
          hint="Expiry is checked on every verification-session GET request -- no client-side timers involved."
        />
        <SettingRow
          label="Re-issuance"
          value="Not yet supported"
          hint="Future: re-issue a fresh link to the same customer from the dashboard or via API."
        />
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection
        title="Notification Preferences"
        description="Configure which events trigger customer notifications and via which channel."
      >
        <SettingRow
          label="verification.link_created"
          value="SMS + Webhook"
          hint="Sends the verification link to the customer and fires a signed webhook to the CRM."
          badge={{ text: "Planned", style: "bg-gray-100 text-gray-500" }}
        />
        <SettingRow
          label="verification.completed"
          value="Webhook"
          hint="Fires a signed webhook when the customer completes and confirms consent."
          badge={{ text: "Planned", style: "bg-gray-100 text-gray-500" }}
        />
        <SettingRow
          label="certificate.created"
          value="Webhook"
          hint="Fires after the certificate is generated, including the certificate ID and URL."
          badge={{ text: "Planned", style: "bg-gray-100 text-gray-500" }}
        />
        <SettingRow
          label="SMS provider"
          value="(not configured)"
          hint="Twilio, AWS SNS, or any provider with a send-SMS API. Future phase."
        />
        <SettingRow
          label="Email provider"
          value="(not configured)"
          hint="SendGrid, Resend, AWS SES, or compatible SMTP relay. Future phase."
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
          value="(not yet available)"
          hint="Future: export a full audit trail as a signed JSON archive before purging logs."
        />
      </SettingsSection>

      {/* Environment status */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-0.5">Environment status</h3>
        <p className="text-xs text-gray-400 mb-4">
          Indicates which environment variables are configured. Values are never displayed here.
        </p>
        {[
          { key: "DATABASE_URL",    present: !!process.env.DATABASE_URL,    required: true,  hint: "PostgreSQL connection string" },
          { key: "APP_URL",         present: !!process.env.APP_URL,         required: true,  hint: "Public base URL for verification links" },
          { key: "ENCRYPTION_KEY",  present: !!process.env.ENCRYPTION_KEY,  required: true,  hint: "32-byte AES-256 key (base64-encoded)" },
        ].map((env) => (
          <div key={env.key} className="py-3 border-b border-gray-100 last:border-0 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-mono text-gray-700">{env.key}</p>
              <p className="text-xs text-gray-400 mt-0.5">{env.hint}</p>
            </div>
            <span
              className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                env.present
                  ? "bg-green-100 text-green-700"
                  : env.required
                  ? "bg-red-100 text-red-600"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {env.present ? "Set" : env.required ? "Missing" : "Not set"}
            </span>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-red-700 mb-3">Danger zone</h3>
        <p className="text-xs text-gray-500 mb-4">
          These actions are irreversible. Confirmation workflows will be added before these controls are enabled.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Suspend all client keys</p>
              <p className="text-xs text-gray-400">Immediately block all API key authentication.</p>
            </div>
            <button disabled className="px-4 py-2 text-xs font-semibold border border-red-200 text-red-300 rounded-lg cursor-not-allowed">
              Suspend all
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Purge expired sessions</p>
              <p className="text-xs text-gray-400">Delete all EXPIRED verification sessions older than the retention window.</p>
            </div>
            <button disabled className="px-4 py-2 text-xs font-semibold border border-red-200 text-red-300 rounded-lg cursor-not-allowed">
              Purge
            </button>
          </div>
        </div>
      </div>
    </DashboardRoleGate>
  );
}
