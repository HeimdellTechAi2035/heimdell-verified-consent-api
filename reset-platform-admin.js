const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const email = "andrewjamessmithurban@gmail.com";
  const newPassword = "AdminTemp947!!";

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw error;

  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error("User not found: " + email);

  const res = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (res.error) throw res.error;

  console.log("PLATFORM ADMIN PASSWORD RESET OK");
  console.log("EMAIL:", email);
  console.log("TEMP PASSWORD:", newPassword);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
