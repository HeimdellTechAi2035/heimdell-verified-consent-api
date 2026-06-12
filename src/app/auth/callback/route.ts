import { redirect } from "next/navigation";
import {
  getPostLoginDashboardDestination,
  revalidateDashboardAuthPaths,
} from "@/lib/dashboard-redirects";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    redirect("/login?error=signin-failed");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect("/login?error=signin-failed");
  }

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?error=session-expired");
  }

  revalidateDashboardAuthPaths();
  const destination = await getPostLoginDashboardDestination({
    externalAuthId: data.user.id,
  });

  redirect(destination);
}
