import { Shell } from "@/components/shell";
import { getContext } from "@/lib/data/context";
import { NAV, ROLE_TAG } from "@/lib/nav";
import { signOut, switchProperty } from "@/lib/actions/ops";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null);
  return (
    <Shell
      nav={NAV[ctx.role]}
      roleTag={ROLE_TAG[ctx.role]}
      scope={ctx.scopeLabel}
      hotel={ctx.isPortfolio ? ctx.scopeLabel : ctx.property.name}
      properties={ctx.properties.map((p) => ({ id: p.id, name: p.name }))}
      propertyId={ctx.property.id}
      userLabel={ctx.fullName ?? ctx.email}
      unread={count ?? 0}
      switchProperty={switchProperty}
      signOut={signOut}
    >
      {children}
    </Shell>
  );
}
