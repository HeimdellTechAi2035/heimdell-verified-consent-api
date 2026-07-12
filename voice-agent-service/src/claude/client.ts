import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

// Sonnet, not Opus, is the deliberate choice here: this is a latency-
// sensitive real-time voice turn (the customer is waiting on the line for
// a reply), not a background/analysis task. Worth A/B testing against
// Haiku for responsiveness once the happy path is proven -- not before.
export const CONVERSATION_MODEL = "claude-sonnet-5";
