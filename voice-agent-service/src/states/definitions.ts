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

const identityCheck: StateDefinition = {
  id: "IDENTITY_CHECK",
  positiveTransition: "SIGNUP_CONFIRMATION",
  otherTransitions: ["WRONG_NUMBER"],
  buildSystemPrompt: (ctx: StateContext) => {
    const { sale } = ctx.callSession;
    return `
You are calling on behalf of the company ${sale.client.name} to confirm a signup for ${sale.productName}. Start with a friendly, clear greeting -- introduce yourself, the company, and the reason for the call, then ask:

"Hi, is that ${sale.customerName}? I'm calling about your signup for ${sale.productName}. It'll take about 5 minutes."

Wait for a reply before asking anything else. If the person confirms they are ${sale.customerName}, call advance_conversation with next_state "SIGNUP_CONFIRMATION". If they say this is the wrong number or they are not ${sale.customerName}, call advance_conversation with next_state "WRONG_NUMBER" and a polite closing reply_text.
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
Confirm the customer's name and address on file: "${sale.customerName}", at "${sale.customerAddress ?? "the address on file"}". Ask if these are correct. Capture any corrections the customer states in captured_data (e.g. { corrected_address: "..." }), note them, and either way call advance_conversation with next_state "PRODUCT_CONFIRMATION" once you have a clear yes or a correction -- both proceed forward, this step does not end the call.
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
Restate the product and pricing: "And you signed up for ${sale.productName}, at ${sale.productPrice.toString()}${frequencySuffix(sale.productFrequency)}. Is that right?" If they correct any detail, capture it in captured_data and note it. Either way, once confirmed or corrected, call advance_conversation with next_state "TERMS_UNDERSTANDING" -- this step does not end the call.
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
    return `
You are verifying a Direct Debit mandate that was already set up at signup -- you are not collecting new payment details, only confirming what's on file. Never ask for or repeat a full account number.

Say: "For security, I just need to confirm a few details already provided when you signed up." Then ask: "I have the bank listed as ${dd.bankName}. Is that correct?" If confirmed, continue; if not, call advance_conversation with next_state "DD_MISMATCH_FOLLOWUP".

Then ask: "And the sort code ending in ${dd.sortCode}. Is that correct?" If confirmed, continue; if not, call advance_conversation with next_state "DD_MISMATCH_FOLLOWUP".

Then ask: "For security, can you tell me the last two digits of the account number you used?" Compare what they say against "${lastTwoDigits}". If it matches, call advance_conversation with next_state "EXPLICIT_AGREEMENT". If it does not match, or they refuse to answer, call advance_conversation with next_state "DD_MISMATCH_FOLLOWUP".
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
