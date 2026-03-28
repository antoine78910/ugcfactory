import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowedForApiTest } from "@/lib/apiTestAllowlist";

export default async function ApiTestLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  if (!isEmailAllowedForApiTest(user.email)) redirect("/app");

  return children;
}
