import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPrimaryAdminEmail } from "@/lib/adminEmails";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";

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
  const admin = createSupabaseServiceClient();
  const email =
    (await resolveAuthUserEmail(user, admin))?.toLowerCase().trim() ?? "";
  if (!isPrimaryAdminEmail(email)) redirect("/link-to-ad");

  return children;
}
