import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export function revalidateDashboardAuthPaths() {
  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/change-password");
  revalidatePath("/dashboard/my-sales");
}

function destinationForUser(user: {
  mustChangePassword: boolean;
  memberships: Array<{ role: string }>;
}) {
  if (user.mustChangePassword) {
    return "/dashboard/change-password";
  }

  const primaryRole = user.memberships[0]?.role;
  return primaryRole === "SELLER" ? "/dashboard/my-sales" : "/dashboard";
}

export async function getPostLoginDashboardDestination(params: {
  externalAuthId: string;
}) {
  const user = await db.user.findUnique({
    where: { externalAuthId: params.externalAuthId },
    select: {
      mustChangePassword: true,
      memberships: {
        where: {
          organization: {
            archivedAt: null,
          },
        },
        orderBy: { createdAt: "asc" },
        select: { role: true },
      },
    },
  });

  return user ? destinationForUser(user) : "/dashboard";
}

export async function getPostPasswordChangeDashboardDestination(params: {
  userId: string;
}) {
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: {
      mustChangePassword: true,
      memberships: {
        where: {
          organization: {
            archivedAt: null,
          },
        },
        orderBy: { createdAt: "asc" },
        select: { role: true },
      },
    },
  });

  return user ? destinationForUser(user) : "/dashboard";
}
