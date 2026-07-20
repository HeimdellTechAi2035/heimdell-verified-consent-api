import nodemailer, { type Transporter } from "nodemailer";

export type NotificationProviderChannel = "EMAIL" | "SMS" | "WHATSAPP";

export type ProviderSendParams = {
  recipient: string;
  subject: string | null;
  body: string;
};

export type ProviderSendResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; retryable: boolean };

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 240);
  }

  return "Provider request failed";
}

function isDevelopmentMockEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.HEIMDELL_NOTIFICATION_MOCK_DELIVERY === "true"
  );
}

function missingProvider(provider: string): ProviderSendResult {
  if (isDevelopmentMockEnabled()) {
    return {
      status: "sent",
      providerMessageId: `mock_${provider}_${Date.now()}`,
    };
  }

  return {
    status: "skipped",
    reason: `${provider} provider credentials are not configured`,
  };
}

// Sends via a real SMTP mailbox (Fasthosts/Livemail, e.g. admin@telecomcompliance.uk)
// rather than a transactional-email API -- no third-party email provider
// account exists for this project. The transporter is cached and reused
// across sends within the same process, keyed on ALL FOUR credential
// values including the password -- a password-only rotation (host/port/
// user unchanged) must also invalidate the cache, or every send keeps
// silently authenticating with the old password until it fails. The
// process still needs restarting (a Netlify/Railway redeploy) to pick up
// the new env var value in the first place; this only prevents a stale
// *in-memory* transporter from outliving that.
let cachedTransporter: Transporter | null = null;
let cachedTransporterKey: string | null = null;

function getSmtpTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    return null;
  }

  const key = `${host}:${port}:${user}:${pass}`;
  if (cachedTransporter && cachedTransporterKey === key) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port),
    // Port 465 is implicit TLS; 587/other ports use STARTTLS instead --
    // "secure" must be false for those or the handshake fails outright.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : Number(port) === 465,
    auth: { user, pass },
  });
  cachedTransporterKey = key;

  return cachedTransporter;
}

export async function sendEmailNotification(
  params: ProviderSendParams
): Promise<ProviderSendResult> {
  const transporter = getSmtpTransporter();
  const from = process.env.NOTIFICATION_EMAIL_FROM ?? process.env.SMTP_USER;

  if (!transporter || !from) {
    return missingProvider("Email");
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: params.recipient,
      subject: params.subject ?? "Heimdell verification update",
      text: params.body,
    });

    return {
      status: "sent",
      providerMessageId: info.messageId || `smtp_${Date.now()}`,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: safeErrorMessage(error),
      retryable: true,
    };
  }
}

async function sendTwilioMessage(params: {
  recipient: string;
  body: string;
  whatsapp: boolean;
}): Promise<ProviderSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = params.whatsapp
    ? process.env.TWILIO_WHATSAPP_FROM
    : process.env.TWILIO_SMS_FROM;

  if (!accountSid || !authToken || !from) {
    return missingProvider(params.whatsapp ? "WhatsApp" : "SMS");
  }

  try {
    const body = new URLSearchParams({
      From: params.whatsapp ? `whatsapp:${from}` : from,
      To: params.whatsapp ? `whatsapp:${params.recipient}` : params.recipient,
      Body: params.body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    const json = (await response.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
    };

    if (response.ok) {
      return {
        status: "sent",
        providerMessageId: json.sid ?? `twilio_${Date.now()}`,
      };
    }

    return {
      status: "failed",
      reason: json.message ?? `Twilio returned HTTP ${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: safeErrorMessage(error),
      retryable: true,
    };
  }
}

export async function sendSmsNotification(
  params: ProviderSendParams
): Promise<ProviderSendResult> {
  return sendTwilioMessage({
    recipient: params.recipient,
    body: params.body,
    whatsapp: false,
  });
}

export async function sendWhatsAppNotification(
  params: ProviderSendParams
): Promise<ProviderSendResult> {
  return sendTwilioMessage({
    recipient: params.recipient,
    body: params.body,
    whatsapp: true,
  });
}

export type CallInitiationResult =
  | { status: "initiated"; providerCallSid: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; retryable: boolean };

/**
 * Places an outbound Twilio Voice call. The call's own TwiML/status/
 * recording webhooks (all signature-verified, see src/lib/twilio-signature.ts)
 * handle everything that happens next -- this only starts the call.
 */
export async function initiateVerificationCall(params: {
  to: string;
  from: string;
  twimlUrl: string;
  statusCallbackUrl: string;
  recordingStatusCallbackUrl: string;
}): Promise<CallInitiationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    if (isDevelopmentMockEnabled()) {
      return { status: "initiated", providerCallSid: `mock_call_${Date.now()}` };
    }
    return { status: "skipped", reason: "Voice provider credentials are not configured" };
  }

  try {
    const body = new URLSearchParams();
    body.set("To", params.to);
    body.set("From", params.from);
    body.set("Url", params.twimlUrl);
    body.set("StatusCallback", params.statusCallbackUrl);
    for (const event of ["initiated", "ringing", "answered", "completed"]) {
      body.append("StatusCallbackEvent", event);
    }
    body.set("Record", "true");
    body.set("RecordingStatusCallback", params.recordingStatusCallbackUrl);
    body.set("RecordingStatusCallbackEvent", "completed");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    const json = (await response.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
    };

    if (response.ok && json.sid) {
      return { status: "initiated", providerCallSid: json.sid };
    }

    return {
      status: "failed",
      reason: json.message ?? `Twilio Voice returned HTTP ${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: safeErrorMessage(error),
      retryable: true,
    };
  }
}
