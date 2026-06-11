"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import {
  API_KEY_MANAGER_ROLES,
  createDashboardApiKey,
  revokeDashboardApiKey,
  type CreatedDashboardApiKey,
} from "@/lib/dashboard-api-keys";

export type CreateApiKeyActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  createdKey: CreatedDashboardApiKey | null;
};

export async function createApiKeyAction(
  _previousState: CreateApiKeyActionState,
  formData: FormData
): Promise<CreateApiKeyActionState> {
  const context = await requireDashboardRole(API_KEY_MANAGER_ROLES);

  try {
    const name = String(formData.get("name") ?? "");
    const organizationId = String(formData.get("organizationId") ?? "");
    const clientIdValue = String(formData.get("clientId") ?? "");
    const expiresAtValue = String(formData.get("expiresAt") ?? "");
    const createdKey = await createDashboardApiKey({
      context,
      name,
      organizationId,
      clientId: clientIdValue || null,
      expiresAt: expiresAtValue || null,
    });

    revalidatePath("/dashboard/api-keys");

    return {
      status: "success",
      message:
        "API key created. Copy the raw key now; Heimdell will not show it again.",
      createdKey,
    };
  } catch (error) {
    console.error("Dashboard API key creation failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "API key could not be created.",
      createdKey: null,
    };
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const context = await requireDashboardRole(API_KEY_MANAGER_ROLES);
  const apiKeyId = String(formData.get("apiKeyId") ?? "");

  try {
    await revokeDashboardApiKey({
      context,
      apiKeyId,
    });

    revalidatePath("/dashboard/api-keys");
  } catch (error) {
    console.error("Dashboard API key revocation failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      apiKeyId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    throw error;
  }
}
