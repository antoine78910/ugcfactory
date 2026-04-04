import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRIMARY_ADMIN_EMAIL = "anto.delbos@gmail.com";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase().trim() ?? "";
  if (!user) redirect("/auth");
  if (email !== PRIMARY_ADMIN_EMAIL) redirect("/link-to-ad");

  return children;
}
