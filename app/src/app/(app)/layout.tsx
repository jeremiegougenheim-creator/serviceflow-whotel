import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/nav/BottomNav";
import { OutletProvider } from "@/context/OutletContext";
import {
  buildCssVars,
  getPropertyTheme,
  getSessionPropertyId,
} from "@/lib/theme";
import type { CSSProperties } from "react";

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

  // Load property theme — inject as CSS custom properties for the entire app shell.
  // Falls back to Lauds defaults (defined in globals.css :root) when no theme row exists.
  const propertyId = await getSessionPropertyId();
  const theme = await getPropertyTheme(propertyId);
  const cssVars = buildCssVars(theme) as CSSProperties;

  return (
    <OutletProvider>
      <div
        style={{ background: "var(--lauds-bg-primary)", ...cssVars }}
        className="min-h-screen flex flex-col"
      >
        <main className="flex-1 overflow-y-auto pb-20">{children}</main>
        <BottomNav />
      </div>
    </OutletProvider>
  );
}
