"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, Lockup } from "./icons";
import { activeHref, type NavItem } from "@/lib/nav";

export interface ShellProps {
  nav: NavItem[];
  roleTag: string;
  scope: string;
  hotel: string;
  properties: { id: string; name: string }[];
  propertyId: string;
  userLabel: string;
  unread: number;
  children: React.ReactNode;
  switchProperty: (formData: FormData) => Promise<void>;
  signOut: () => Promise<void>;
}

/** The app shell: header with the lockup, a role tag and the account menu; bottom tabs on phones, a sidebar on wide screens. */
export function Shell(p: ShellProps) {
  const pathname = usePathname();
  const active = activeHref(pathname, p.nav);
  const [menu, setMenu] = useState(false);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex md:flex-col md:gap-6 md:border-r md:border-(--sf-rule) md:px-5 md:py-6 md:sticky md:top-0 md:h-dvh">
        <Lockup scope={p.scope} />
        <nav className="flex flex-col gap-1" aria-label="Sections">
          {p.nav.map((n) => (
            <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] ${active === n.href ? "bg-gold/10 text-gold-light" : "text-mist hover:text-cream"}`}>
              <Icon name={n.icon} size={20} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 text-[13px]">
          <Link href="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-2 text-mist hover:text-cream">
            <Icon name="bell" size={18} />
            Notifications{p.unread ? <span className="pill pill-gd ml-auto">{p.unread}</span> : null}
          </Link>
          <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2 text-mist hover:text-cream">
            <Icon name="settings" size={18} />
            Set-up
          </Link>
          <form action={p.signOut}>
            <button type="submit" className="w-full rounded-xl px-3 py-2 text-left text-mist hover:text-cream">
              Sign out · {p.userLabel}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-(--sf-rule) bg-ink/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="md:hidden">
            <Lockup scope={p.hotel.toUpperCase()} />
          </div>
          <div className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-mist md:block">{p.hotel}</div>
          <div className="flex items-center gap-2">
            <Link href="/notifications" className="relative rounded-full p-2 text-mist hover:text-cream md:hidden" aria-label="Notifications">
              <Icon name="bell" size={20} />
              {p.unread ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold" /> : null}
            </Link>
            <button type="button" onClick={() => setMenu((m) => !m)} className="pill pill-gd" aria-haspopup="menu" aria-expanded={menu}>
              {p.roleTag}
            </button>
          </div>
          {menu ? (
            <div className="absolute right-4 top-14 z-30 w-72 rounded-2xl border border-(--sf-rule-strong) bg-navy-mid p-3 shadow-2xl" role="menu">
              <div className="px-2 pb-2 text-[12px] text-mist">{p.userLabel}</div>
              {p.properties.length > 1 ? (
                <form action={p.switchProperty} className="px-2 pb-2">
                  <label className="lbl" htmlFor="sf-property">Hotel</label>
                  <select id="sf-property" name="property_id" defaultValue={p.propertyId} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                    {p.properties.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))}
                  </select>
                </form>
              ) : null}
              <Link href="/settings" className="block rounded-lg px-2 py-2 text-[14px] text-cream hover:bg-ink/50" onClick={() => setMenu(false)}>
                Set-up and imports
              </Link>
              <Link href="/notifications" className="block rounded-lg px-2 py-2 text-[14px] text-cream hover:bg-ink/50" onClick={() => setMenu(false)}>
                Notifications
              </Link>
              <form action={p.signOut}>
                <button type="submit" className="w-full rounded-lg px-2 py-2 text-left text-[14px] text-mist hover:bg-ink/50">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </header>

        <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">{p.children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-(--sf-rule) bg-ink/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden" aria-label="Sections">
          {p.nav.map((n) => (
            <Link key={n.href} href={n.href} className={`flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${active === n.href ? "text-gold-light" : "text-mist"}`} aria-current={active === n.href ? "page" : undefined}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
