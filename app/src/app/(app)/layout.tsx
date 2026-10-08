import { Shell } from "@/components/shell";
import { getContext, getUnreadCount } from "@/lib/data/context";
import { BACKTEST_ROLES, NAV, ROLE_NAME, ROLE_TAG } from "@/lib/nav";
import { setTheme, signOut, switchProperty, switchRole } from "@/lib/actions/ops";
import { readTheme } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, count, theme] = await Promise.all([getContext(), getUnreadCount(), readTheme()]);
  return (
    <Shell
      nav={NAV[ctx.role]}
      roleTag={ROLE_TAG[ctx.role]}
      scope={ctx.scopeLabel}
      hotel={ctx.isPortfolio ? ctx.scopeLabel : ctx.property.name}
      propertyName={ctx.property.name}
      properties={ctx.properties.map((p) => ({ id: p.id, name: p.name }))}
      propertyId={ctx.property.id}
      userLabel={ctx.fullName ?? ctx.email}
      unread={count ?? 0}
      roles={ctx.heldRoles.map((r) => ({ value: r, label: ROLE_NAME[r] }))}
      role={ctx.role}
      switchProperty={switchProperty}
      switchRole={switchRole}
      theme={theme}
      canSetUp={ctx.roles.some((r) => ["gm", "fnb_mgr", "chef", "hk", "eng", "admin"].includes(r))}
      canBacktest={BACKTEST_ROLES.includes(ctx.role)}
      setTheme={setTheme}
      signOut={signOut}
    >
      {children}
    </Shell>
  );
}
