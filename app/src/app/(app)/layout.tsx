import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/nav/BottomNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-lauds-cream flex flex-col">
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
