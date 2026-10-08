"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, Lockup } from "./icons";
import { activeHref, type NavItem } from "@/lib/nav";

/** Screens laid out for a desktop as well as a phone. */
const WIDE = ["/portfolio", "/backtest", "/home", "/brief", "/live", "/roster"];

export interface ShellProps {
  nav: NavItem[];
  roleTag: string;
  scope: string;
  hotel: string;
  /** the hotel whose screens are shown, even when the scope is a region or the group */
  propertyName: string;
  properties: { id: string; name: string }[];
  propertyId: string;
  userLabel: string;
  unread: number;
  /** the roles this person holds on the hotel, with their names; more than one shows "View as" */
  roles: { value: string; label: string }[];
  role: string;
  /** Set-up is shown only to roles that can change something in it */
  canSetUp: boolean;
  /** the backtest, for the roles that plan on the forecast or judge it */
  canBacktest: boolean;
  children: React.ReactNode;
  switchProperty: (formData: FormData) => Promise<void>;
  switchRole: (formData: FormData) => Promise<void>;
  /** appearance chosen on this device */
  theme: "system" | "light" | "dark";
  setTheme: (formData: FormData) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * The app shell: header with the lockup, the account button and the menu; bottom tabs on phones
 * and tablets (a kitchen tablet keeps its full width), a sidebar from 1024 px.
 */
export function Shell(p: ShellProps) {
  const pathname = usePathname();
  const active = activeHref(pathname, p.nav);
  // tables and side-by-side columns get the room a desktop has; reading screens keep a reading width
  const wide = WIDE.some((w) => pathname === w || pathname.startsWith(w + "/"));
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [openedAt, setOpenedAt] = useState(pathname);

  // a new screen closes the menu
  if (menu && openedAt !== pathname) {
    setMenu(false);
    setOpenedAt(pathname);
  }

  // Escape and a tap outside close it; focus goes into it when it opens and back when it closes
  useEffect(() => {
    if (!menu) return;
    const first = menuRef.current?.querySelector<HTMLElement>("select, button, a");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) setMenu(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menu]);


  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:border-r lg:border-(--sf-rule) lg:px-5 lg:py-6">
        <Lockup scope={p.scope} gid="sfGoldSide" />
        {p.roles.length > 1 ? <ViewAs roles={p.roles} role={p.role} action={p.switchRole} id="sf-view-as-side" /> : null}
        <nav className="flex flex-col gap-1" aria-label="Sections">
          {p.nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] ${active === n.href ? "bg-gold/10 text-gold-light" : "text-mist hover:text-cream"}`}>
              <Icon name={n.icon} size={20} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 text-[13.5px]">
          <Link href="/notifications" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-mist hover:text-cream">
            <Icon name="bell" size={18} />
            Notifications{p.unread ? <span className="pill pill-gd ml-auto">{p.unread}</span> : null}
          </Link>
          {p.canBacktest ? (
            <Link href="/backtest" aria-current={pathname.startsWith("/backtest") ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 ${pathname.startsWith("/backtest") ? "bg-gold/10 text-gold-light" : "text-mist hover:text-cream"}`}>
              <Icon name="chart" size={18} />
              Backtest
            </Link>
          ) : null}
          {p.canSetUp ? (
            <Link href="/settings" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-mist hover:text-cream">
              <Icon name="settings" size={18} />
              Set-up
            </Link>
          ) : null}
          <form action={p.signOut}>
            <button type="submit" className="min-h-11 w-full rounded-xl px-3 py-2 text-left text-mist hover:text-cream">
              Sign out · {p.userLabel}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-(--sf-rule) bg-ink/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur lg:px-8">
          <div className="lg:hidden">
            <Lockup scope={(pathname.startsWith("/portfolio") ? p.hotel : p.propertyName).toUpperCase()} gid="sfGoldHead" />
          </div>
          <div className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-mist lg:block">
            {p.propertyName}
            {p.hotel !== p.propertyName ? <span className="ml-2 text-gold/80">· {p.hotel}</span> : null}
          </div>
          <div className="flex items-center gap-1">
            <Link href="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full text-mist hover:text-cream lg:hidden" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
              <Icon name="bell" size={21} />
              {p.unread ? <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gold-fill" /> : null}
            </Link>
            <button
              ref={buttonRef}
              type="button"
              onClick={() => {
                setOpenedAt(pathname);
                setMenu((m) => !m);
              }}
              className="flex h-11 min-w-11 items-center justify-center rounded-full border border-(--sf-rule-strong) bg-gold/10 px-3 text-[12px] font-semibold tracking-[0.08em] text-gold-light"
              aria-haspopup="true"
              aria-expanded={menu}
              aria-controls="sf-account-menu"
              aria-label={`Account and settings · ${p.roleTag}`}
            >
              {p.roleTag}
            </button>
          </div>
          {menu ? (
            <div id="sf-account-menu" ref={menuRef} className="absolute right-4 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-(--sf-rule-strong) bg-navy-mid p-3 shadow-2xl" role="dialog" aria-label="Account">
              <div className="px-2 pb-2 text-[12.5px] text-mist">{p.userLabel}</div>
              {p.roles.length > 1 ? (
                <div className="px-2 pb-3">
                  <ViewAs roles={p.roles} role={p.role} action={p.switchRole} id="sf-view-as-menu" />
                </div>
              ) : null}
              {p.properties.length > 1 ? (
                <form action={p.switchProperty} className="px-2 pb-3">
                  <label className="lbl" htmlFor="sf-property">
                    Hotel
                  </label>
                  <select id="sf-property" name="property_id" defaultValue={p.propertyId} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                    {p.properties.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))}
                  </select>
                </form>
              ) : null}
              <div className="px-2 pb-3">
                <span className="lbl">Appearance</span>
                <form action={p.setTheme} className="grid grid-cols-3 gap-1 rounded-full border border-(--sf-rule-strong) p-1" role="radiogroup" aria-label="Appearance">
                  {(
                    [
                      ["system", "Device"],
                      ["light", "Paper"],
                      ["dark", "Night"],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="submit" name="theme" value={v} role="radio" aria-checked={p.theme === v} className={`min-h-10 rounded-full text-[13.5px] ${p.theme === v ? "bg-gold/15 text-gold-light" : "text-mist hover:text-cream"}`}>
                      {label}
                    </button>
                  ))}
                </form>
              </div>
              {p.canBacktest ? (
                <Link href="/backtest" className="flex min-h-11 items-center rounded-lg px-2 text-[14px] text-cream hover:bg-ink/50">
                  Backtest: how close the forecast runs
                </Link>
              ) : null}
              {p.canSetUp ? (
                <Link href="/settings" className="flex min-h-11 items-center rounded-lg px-2 text-[14px] text-cream hover:bg-ink/50">
                  Set-up and imports
                </Link>
              ) : null}
              <Link href="/notifications" className="flex min-h-11 items-center rounded-lg px-2 text-[14px] text-cream hover:bg-ink/50">
                Notifications{p.unread ? ` · ${p.unread} unread` : ""}
              </Link>
              <form action={p.signOut}>
                <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-2 text-left text-[14px] text-mist hover:bg-ink/50">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </header>

        <main id="main" tabIndex={-1} className={`mx-auto w-full ${wide ? "max-w-[720px] lg:max-w-[1180px]" : "max-w-[720px]"} flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 outline-none md:px-8 lg:pb-10 lg:pt-8`}>
          {p.children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-(--sf-rule) bg-ink/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Sections">
          {p.nav.map((n) => (
            <Link key={n.href} href={n.href} className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${active === n.href ? "text-gold-light" : "text-mist"}`} aria-current={active === n.href ? "page" : undefined}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ViewAs({ roles, role, action, id }: { roles: { value: string; label: string }[]; role: string; action: (formData: FormData) => Promise<void>; id: string }) {
  return (
    <form action={action}>
      <label className="lbl" htmlFor={id}>
        View as
      </label>
      <select id={id} name="role" defaultValue={role} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </form>
  );
}
