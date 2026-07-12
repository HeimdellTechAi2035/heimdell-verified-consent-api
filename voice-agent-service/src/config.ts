function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[voice-agent] missing required env var: ${name}`);
  }
  return value;
}

// Fails fast on boot rather than surfacing a confusing error mid-call --
// every one of these is read by code that runs on the first inbound call,
// so a missing value is always a deploy-time misconfiguration, never a
// legitimate runtime state to handle gracefully.
export const config = {
  port: Number(process.env.PORT ?? 8080),
  twilioAccountSid: requireEnv("TWILIO_ACCOUNT_SID"),
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  appUrl: requireEnv("APP_URL").replace(/\/$/, ""),
};
