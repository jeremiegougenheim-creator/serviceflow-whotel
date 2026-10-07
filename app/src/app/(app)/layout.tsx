import { Shell } from "@/components/shell";
import { getContext, getUnreadCount } from "@/lib/data/context";
import { NAV, ROLE_NAME, ROLE_TAG } from "@/lib/nav";
import { signOut, switchProperty, switchRole } from "@/lib/actions/ops";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, count] = await Promise.all([getContext(), getUnreadCount()]);
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
      roles={ctx.heldRoles.map((r) => ({ value: r, label: ROLE_NAME[r] }))}
      role={ctx.role}
      switchProperty={switchProperty}
      switchRole={switchRole}
      signOut={signOut}
    >
      {children}
    </Shell>
  );
}
