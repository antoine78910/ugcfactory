import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPrimaryAdminEmail } from "@/lib/adminEmails";
import { sessionUserEmail } from "@/lib/sessionUserEmail";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  const email = sessionUserEmail(user)?.toLowerCase().trim() ?? "";
  if (!isPrimaryAdminEmail(email)) redirect("/link-to-ad");

  return children;
}
