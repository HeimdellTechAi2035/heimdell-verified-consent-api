"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  disableClientWebhookEndpoint,
  upsertClientWebhookEndpoint,
  type WebhookSettingsMutationResult,
} from "@/lib/dashboard-webhook-settings";

export type WebhookSettingsActionState = {
  ok: boolean;
  message: string | null;
  clientId?: string;
  oneTimeSecret?: string;
};

function toActionState(
  result: WebhookSettingsMutationResult
): WebhookSettingsActionState {
  return {
    ok: result.ok,
    message: result.message,
    ...(result.ok ? { clientId: result.clientId } : {}),
    ...(result.ok && result.oneTimeSecret
      ? { oneTimeSecret: result.oneTimeSecret }
      : {}),
  };
}

export async function saveWebhookEndpointAction(
  _state: WebhookSettingsActionState,
  formData: FormData
): Promise<WebhookSettingsActionState> {
  const context = await requireOrganizationMembership();
  const clientId = String(formData.get("clientId") ?? "");
  const webhookUrl = String(formData.get("webhookUrl") ?? "");
  const rotateSecret = formData.get("rotateSecret") === "on";

  try {
    const result = await upsertClientWebhookEndpoint({
      context,
      clientId,
      webhookUrl,
      rotateSecret,
    });
    revalidatePath("/dashboard/integrations");
    return toActionState(result);
  } catch {
    return {
      ok: false,
      message: "Webhook endpoint could not be saved for this role or organization.",
    };
  }
}

export async function disableWebhookEndpointAction(
  _state: WebhookSettingsActionState,
  formData: FormData
): Promise<WebhookSettingsActionState> {
  const context = await requireOrganizationMembership();
  const clientId = String(formData.get("clientId") ?? "");

  try {
    const result = await disableClientWebhookEndpoint({ context, clientId });
    revalidatePath("/dashboard/integrations");
    return toActionState(result);
  } catch {
    return {
      ok: false,
      message: "Webhook endpoint could not be disabled for this role or organization.",
    };
  }
}
