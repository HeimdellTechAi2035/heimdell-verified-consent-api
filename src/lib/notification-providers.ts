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

export async function sendEmailNotification(
  params: ProviderSendParams
): Promise<ProviderSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;

  if (!apiKey || !from) {
    return missingProvider("Email");
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.recipient,
        subject: params.subject ?? "Heimdell verification update",
        text: params.body,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (response.ok) {
      return {
        status: "sent",
        providerMessageId: json.id ?? `resend_${Date.now()}`,
      };
    }

    return {
      status: "failed",
      reason: json.message ?? `Email provider returned HTTP ${response.status}`,
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
