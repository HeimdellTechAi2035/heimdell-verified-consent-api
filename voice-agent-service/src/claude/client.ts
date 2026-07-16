import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

// A short timeout matters here specifically because this is a live phone
// call -- the SDK's own default retries already run before an error ever
// reaches our code, so a long timeout on top of that risks tens of
// seconds of dead air. Better to fail fast and let the caller speak a
// clear apology than to sit silently retrying while the customer waits.
export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 12_000 });

// Sonnet, not Opus, is the deliberate choice here: this is a latency-
// sensitive real-time voice turn (the customer is waiting on the line for
// a reply), not a background/analysis task. Worth A/B testing against
// Haiku for responsiveness once the happy path is proven -- not before.
export const CONVERSATION_MODEL = "claude-sonnet-5";
