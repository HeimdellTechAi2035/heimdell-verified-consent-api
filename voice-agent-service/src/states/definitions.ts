import { buildIdentityGreetingText } from "@/lib/voice-twiml";
import type { StateContext, StateDefinition } from "./types";

// Each prompt below is adapted from the user's original Voiceflow agent
// graph (same instructions, same intent per node), with Heimdell's real
// field names substituted for the Voiceflow template variables. The
// direct-debit state deliberately reads the sort code back in full (not
// sensitive the way an account number is) but only ever asks for -- and
// compares against -- the last two digits of the account number; the full
// number is never read aloud or decrypted here.

function frequencySuffix(frequency: string | null) {
  return frequency ? ` ${frequency}` : "";
}

/**
 * Sort codes are stored as a plain 6-digit string with no separators. Read
 * as one number ("601949"), Twilio's TTS collapses it into a single large
 * number instead of the customer's actual sort code. UK sort codes are
 * always spoken in pairs ("sixty, nineteen, forty-nine"), so the pairs are
 * spelled out as separate words here to force that grouping regardless of
 * how the TTS engine would otherwise parse a bare digit string.
 */
function formatSortCodeForSpeech(sortCode: string): string {
  const pairs = sortCode.match(/\d{2}/g) ?? [sortCode];
  return pairs.join(", ");
}

const identityCheck: StateDefinition = {
  id: "IDENTITY_CHECK",
  positiveTransition: "SIGNUP_CONFIRMATION",
  otherTransitions: ["WRONG_NUMBER"],
  buildSystemPrompt: (ctx: StateContext) => {
    const { sale } = ctx.callSession;
    const greeting = buildIdentityGreetingText(sale.customerName, sale.productName, sale.client.name);
    return `
You are calling on behalf of the company ${sale.client.name} to confirm a signup for ${sale.productName}. The greeting has ALREADY been spoken to the customer by the phone system, word for word: "${greeting}" Do not repeat or re-ask any part of that -- the first thing in the conversation history is the customer's reply to it.

Interpret that reply. If the person confirms they are ${sale.customerName}, call advance_conversation with next_state "SIGNUP_CONFIRMATION" and a brief acknowledgement in reply_text. If they say this is the wrong number or they are not ${sale.customerName}, call advance_conversation with next_state "WRONG_NUMBER" and a polite closing reply_text. If their reply is unclear or doesn't actually answer the question, set next_state to "IDENTITY_CHECK" (stay here) and ask again in reply_text: "Sorry, is that ${sale.customerName}?"
    `.trim();
  },
};

const signupConfirmation: StateDefinition = {
  id: "SIGNUP_CONFIRMATION",
  positiveTransition: "NAME_ADDRESS",
  otherTransitions: ["STOP_REQUESTED", "SIGNUP_UNCONFIRMED_FOLLOWUP"],
  buildSystemPrompt: (ctx: StateContext) => {
    const { sale } = ctx.callSession;
    return `
Ask: "Did you recently sign up for ${sale.productName}?"

If they confirm, call advance_conversation with next_state "NAME_ADDRESS". If they deny it and clearly want no further contact, call advance_conversation with next_state "STOP_REQUESTED". If they're unsure, or deny it but don't explicitly ask to stop contact, call advance_conversation with next_state "SIGNUP_UNCONFIRMED_FOLLOWUP".
    `.trim();
  },
};

const nameAddress: StateDefinition = {
  id: "NAME_ADDRESS",
  positiveTransition: "PRODUCT_CONFIRMATION",
  otherTransitions: [],
  consentEventOnSuccess: "NAME_ADDRESS_CONFIRMED",
  buildSystemPrompt: (ctx: StateContext) => {
    const { sale } = ctx.callSession;
    return `
Confirm the customer's name and address on file: "${sale.customerName}", at "${sale.customerAddress ?? "the address on file"}". Ask if these are correct.

If both are correct, call advance_conversation with next_state "PRODUCT_CONFIRMATION" and no captured_data.

If the customer says the name or address is wrong: ask what it should be, then read back exactly what you heard and ask them to confirm it's right. Only once they've confirmed the correction is accurate, call advance_conversation with next_state "PRODUCT_CONFIRMATION" and captured_data: { corrections: [{ field: "customerName", value: "<corrected name>" }] } -- include a separate entry per field that changed (customerName and/or customerAddress). Never include a correction you haven't read back and had confirmed.

This step always moves forward to PRODUCT_CONFIRMATION once you have a clear yes or a confirmed correction -- it never ends the call.
    `.trim();
  },
};

const productConfirmation: StateDefinition = {
  id: "PRODUCT_CONFIRMATION",
  positiveTransition: "TERMS_UNDERSTANDING",
  otherTransitions: [],
  consentEventOnSuccess: "PRODUCT_CONFIRMED",
  buildSystemPrompt: (ctx: StateContext) => {
    const { sale } = ctx.callSession;
    return `
Restate the product and pricing: "And you signed up for ${sale.productName}, at ${sale.productPrice.toString()}${frequencySuffix(sale.productFrequency)}. Is that right?"

If correct, call advance_conversation with next_state "TERMS_UNDERSTANDING" and no captured_data.

If the customer says the product name, price, or frequency is wrong: ask what it should be, read back exactly what you heard, and only once they've confirmed it's right, call advance_conversation with next_state "TERMS_UNDERSTANDING" and captured_data: { corrections: [{ field: "productName" | "productPrice" | "productFrequency", value: "<corrected value>" }] } -- one entry per field that changed. For productPrice, capture just the number (e.g. "34.99"), no currency symbol. Never include a correction you haven't read back and had confirmed.

This step always moves forward once you have a clear yes or a confirmed correction -- it never ends the call.
    `.trim();
  },
};

const termsUnderstanding: StateDefinition = {
  id: "TERMS_UNDERSTANDING",
  positiveTransition: "POLICY_FAQ",
  otherTransitions: ["TERMS_NOT_UNDERSTOOD_FOLLOWUP"],
  consentEventOnSuccess: "TERMS_ACKNOWLEDGED",
  buildSystemPrompt: (ctx: StateContext) => {
    const { policySnapshot } = ctx.callSession;
    return `
Summarise the terms and conditions in plain language: "${policySnapshot.termsAndConditions}" -- also mention the cooling-off policy: "${policySnapshot.coolingOffPolicy}". Ask if they understand. If not, explain again more simply using the same wording, focusing on billing, cancellation ("${policySnapshot.cancellationInstructions}"), and refunds. If they now understand, call advance_conversation with next_state "POLICY_FAQ". If they still do not understand after one re-explanation, call advance_conversation with next_state "TERMS_NOT_UNDERSTOOD_FOLLOWUP".
    `.trim();
  },
};

const policyFaq: StateDefinition = {
  id: "POLICY_FAQ",
  positiveTransition: "DIRECT_DEBIT",
  otherTransitions: ["OBJECTION_FOLLOWUP"],
  consentEventOnSuccess: "POLICIES_ACKNOWLEDGED",
  buildSystemPrompt: () => {
    return `
Ask: "Do you have any questions about any of that?" You are a verification call, not a customer service or sales agent -- do not attempt to answer questions about policies, pricing, data handling, or anything else yourself, even if you think you know the answer. If the customer has any questions at all, say: "For anything like that, please ask the sales agent who set this up with you -- they'll be able to help." Then ask if they're otherwise happy to continue. For light objections (e.g. hesitation, "why are you calling"), give brief reassurance that this call is just to confirm the details already agreed, then redirect any substantive question the same way. If there are no questions, or the customer is happy to continue after being pointed to the sales agent, call advance_conversation with next_state "DIRECT_DEBIT". If the customer objects and wants to stop instead of continuing, call advance_conversation with next_state "OBJECTION_FOLLOWUP".
    `.trim();
  },
};

const directDebit: StateDefinition = {
  id: "DIRECT_DEBIT",
  positiveTransition: "EXPLICIT_AGREEMENT",
  otherTransitions: ["DD_MISMATCH_FOLLOWUP"],
  consentEventOnSuccess: "DIRECT_DEBIT_AUTHORISED",
  buildSystemPrompt: (ctx: StateContext) => {
    const dd = ctx.callSession.sale.directDebitMandate;
    if (!dd) {
      return `
There is no Direct Debit mandate on file for this sale. Say: "It looks like I don't have payment details available for this one, so I'll mark this for manual review." Then call advance_conversation with next_state "DD_MISMATCH_FOLLOWUP".
      `.trim();
    }

    const lastTwoDigits = dd.accountNumberLast4.slice(-2);
    const spokenSortCode = formatSortCodeForSpeech(dd.sortCode);
    return `
You are verifying a Direct Debit mandate that was already set up at signup -- you are not collecting new payment details, only confirming what's on file. Never ask for or state a full account number -- you only ever have the last two digits, never the full number.

This is three separate confirmations, one per turn -- ask one, wait for a clear answer, then move to the next. Only ever include ONE corrections entry per turn, and never include a bank name or sort code correction you haven't read back and had the customer confirm as accurate first:

1. Say: "For security, I just need to confirm a few details already provided when you signed up. I have the bank listed as ${dd.bankName}. Is that correct?"
   - If confirmed, move to the next confirmation on your following turn (stay in this state, no captured_data).
   - If not: ask what the correct bank name is, read it back to confirm, and once they've confirmed it, move to the next confirmation with captured_data: { corrections: [{ field: "bankName", value: "<corrected bank name>" }] }.

2. Ask: "And the sort code as ${spokenSortCode}. Is that correct?" Say the sort code EXACTLY as written above, with a distinct pause between each pair of digits -- never run it together as one number.
   - If confirmed, move to the next confirmation on your following turn (stay in this state, no captured_data).
   - If not: ask what the correct sort code is, read it back digit-pair by digit-pair to confirm, and once they've confirmed it, move to the next confirmation with captured_data: { corrections: [{ field: "sortCode", value: "<6 digits only, no spaces or dashes>" }] }.

3. Ask: "And the account number ending in ${lastTwoDigits}. Is that correct?"
   - If confirmed, call advance_conversation with next_state "EXPLICIT_AGREEMENT".
   - If not, or they seem unsure: say something like "No problem, I'll flag this for our team to follow up on directly" -- never ask for or accept a full account number over the phone -- then call advance_conversation with next_state "DD_MISMATCH_FOLLOWUP", optionally with captured_data: { corrections: [{ field: "accountNumberLast4", value: "<whatever they say it should end in, if they give one>" }] }.
    `.trim();
  },
};

const explicitAgreement: StateDefinition = {
  id: "EXPLICIT_AGREEMENT",
  positiveTransition: "COMPLETED",
  otherTransitions: ["AGREEMENT_REFUSED"],
  consentEventOnSuccess: "EXPLICIT_AGREEMENT_CONFIRMED",
  buildSystemPrompt: (ctx: StateContext) => {
    const { sale } = ctx.callSession;
    return `
Ask for the customer's explicit agreement to proceed with ${sale.productName} on the terms just discussed. If they clearly agree, thank them, confirm a text message confirmation will follow, and call advance_conversation with next_state "COMPLETED". If they refuse or decline to proceed, acknowledge it politely and call advance_conversation with next_state "AGREEMENT_REFUSED".
    `.trim();
  },
};

export const STATE_DEFINITIONS: Record<string, StateDefinition> = {
  IDENTITY_CHECK: identityCheck,
  SIGNUP_CONFIRMATION: signupConfirmation,
  NAME_ADDRESS: nameAddress,
  PRODUCT_CONFIRMATION: productConfirmation,
  TERMS_UNDERSTANDING: termsUnderstanding,
  POLICY_FAQ: policyFaq,
  DIRECT_DEBIT: directDebit,
  EXPLICIT_AGREEMENT: explicitAgreement,
};
