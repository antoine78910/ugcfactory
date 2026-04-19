import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPrimaryAdminEmail } from "@/lib/adminEmails";

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
  if (!isPrimaryAdminEmail(email)) redirect("/link-to-ad");

  return children;
}
