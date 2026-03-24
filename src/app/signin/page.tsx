import { redirect } from "next/navigation";
import AuthClient from "@/app/auth/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SignInPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return <AuthClient mode="signin" />;
}

