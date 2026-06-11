// /dashboard root — redirect to /dashboard/overview.
import { redirect } from "next/navigation";

export default function DashboardRootPage() {
  redirect("/dashboard/overview");
}
