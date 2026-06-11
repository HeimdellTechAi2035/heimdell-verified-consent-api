"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email) {
    redirect("/login?error=missing-email");
  }

  if (!password) {
    redirect("/login?error=missing-password");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=signin-failed");
  }

  redirect("/dashboard");
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/login?error=missing-email");
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error("[login] Supabase magic-link sign-in failed", {
      message: error.message,
      status: error.status,
      name: error.name,
    });
    redirect("/login?error=signin-failed");
  }

  redirect("/login?sent=1");
}
