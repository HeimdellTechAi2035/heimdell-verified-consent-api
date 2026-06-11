const { PrismaClient } = require("@prisma/client");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const email = "clientadmin@testtelecom.local";
  const password = "ClientTemp947!!";

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  console.log("SUPABASE USER ID:", data.user.id);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true },
  });

  console.log("DB USER:", user
    ? {
        id: user.id,
        email: user.email,
        externalAuthId: user.externalAuthId,
        memberships: user.memberships.map((m) => ({
          organizationId: m.organizationId,
          role: m.role,
        })),
      }
    : null
  );

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
