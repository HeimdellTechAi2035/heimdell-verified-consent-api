"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireDashboardUser } from "@/lib/dashboard-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function changeTemporaryPassword(formData: FormData) {
  const user = await requireDashboardUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!currentPassword) {
    redirect("/dashboard/change-password?error=missing-current-password");
  }

  if (newPassword.length < 12) {
    redirect("/dashboard/change-password?error=weak-password");
  }

  const supabase = await createSupabaseServerClient();

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    console.error("[change-password] Current password verification failed", {
      message: verifyError.message,
      status: verifyError.status,
      name: verifyError.name,
    });
    redirect("/dashboard/change-password?error=current-password-invalid");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    console.error("[change-password] Supabase password update failed", {
      message: updateError.message,
      status: updateError.status,
      name: updateError.name,
    });
    redirect("/dashboard/change-password?error=password-update-failed");
  }

  await db.user.update({
    where: { id: user.id },
    data: { mustChangePassword: false },
  });

  redirect("/dashboard");
}
