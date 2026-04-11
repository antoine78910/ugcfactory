import { redirect } from "next/navigation";
import AuthClient from "@/app/auth/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const params = await searchParams;
  const redirectTo = params?.redirect;

  if (user) redirect(redirectTo || "/");

  return <AuthClient mode="signup" redirectTo={redirectTo} />;
}

