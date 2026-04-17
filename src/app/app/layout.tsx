import { redirect } from "next/navigation";
import SeedanceServiceBanner from "@/app/_components/SeedanceServiceBanner";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <div className="flex min-h-screen flex-col">
      <SeedanceServiceBanner />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

