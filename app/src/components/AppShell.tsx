import Link from "next/link";
import { Icon, Lockup } from "@/components/Icon";
import type { Session } from "@/lib/session";
import { navFor, ROLE_TAG } from "@/lib/session/nav";
import { NavLinks } from "./NavLinks";
import { PropertySwitcher } from "./PropertySwitcher";

export function AppShell({ session, unread, children }: { session: Session; unread: number; children: React.ReactNode }) {
  const items = navFor(session.role, !!session.scope);
  const scope = session.scope && !session.property ? `${session.scope.label} · ${session.scope.count} hotels` : (session.property?.name ?? "ServiceFlow").toUpperCase();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* desktop rail */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-8 lg:px-6 lg:py-7 lg:border-r lg:border-[var(--sf-rule)] lg:sticky lg:top-0 lg:h-dvh">
        <Lockup scope={scope} />
        <nav className="flex flex-col gap-1">
          <NavLinks items={items} variant="rail" />
        </nav>
        <div className="mt-auto flex flex-col gap-3 text-[13px] muted">
          {session.properties.length > 1 && <PropertySwitcher properties={session.properties.map((p) => ({ id: p.property.id, name: p.property.name }))} current={session.property?.id ?? null} />}
          <Link href="/notifications" className="flex items-center gap-2 hover:text-cream">
            <Icon name="bell" size={16} /> Notifications {unread > 0 && <span className="pill pill-gd ml-auto">{unread}</span>}
          </Link>
          <Link href="/settings" className="flex items-center gap-2 hover:text-cream">
            <Icon name="settings" size={16} /> Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className="flex items-center gap-2 hover:text-cream" type="submit">
              <Icon name="logout" size={16} /> Sign out
            </button>
          </form>
          <div className="pt-2 text-[11px] leading-snug">
            {session.fullName ?? session.email}
            <br />
            <span className="pill pill-gd mt-1">{ROLE_TAG[session.role]}</span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        {/* phone header */}
        <header className="lg:hidden sticky top-0 z-20 bg-[color-mix(in_oklab,var(--color-ink)_88%,transparent)] backdrop-blur border-b border-[var(--sf-rule)] px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between">
          <Lockup scope={scope} />
          <div className="flex items-center gap-2">
            <Link href="/notifications" aria-label="Notifications" className="relative p-1.5 rounded-full hover:bg-navy">
              <Icon name="bell" size={18} />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-gold" />}
            </Link>
            <Link href="/settings" className="pill pill-gd">
              {ROLE_TAG[session.role]}
            </Link>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[720px] lg:max-w-[880px] mx-auto px-4 lg:px-10 py-5 lg:py-8 pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-10">{children}</main>

        {/* phone bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-[color-mix(in_oklab,var(--color-ink)_92%,transparent)] backdrop-blur border-t border-[var(--sf-rule)] px-2 pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around">
            <NavLinks items={items} variant="bottom" />
          </div>
        </nav>
      </div>
    </div>
  );
}
