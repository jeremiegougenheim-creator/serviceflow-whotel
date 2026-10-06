"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./Icon";
import type { NavItem } from "@/lib/session/nav";

/** Screens reached through in-screen tabs keep their parent lit. */
const FAMILY: Record<string, string> = { "/plan": "/live", "/waste": "/live" };

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "rail" | "bottom" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const lens = params.get("lens");
  const isOn = (href: string) => {
    const [path, qs] = href.split("?");
    if (pathname === path || pathname.startsWith(path + "/")) {
      if (qs && lens) return qs.includes(`lens=${lens}`);
      return true;
    }
    if (items.some((i) => i.href.split("?")[0] === pathname)) return false;
    return FAMILY[pathname] === path;
  };
  if (variant === "rail") {
    return (
      <>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] ${isOn(i.href) ? "bg-navy text-gold-light" : "muted hover:text-cream"}`}>
            <Icon name={i.icon} size={18} /> {i.label}
          </Link>
        ))}
      </>
    );
  }
  return (
    <>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-1 px-3 py-2.5 text-[9.5px] tracking-[0.16em] uppercase ${isOn(i.href) ? "text-gold-light" : "muted"}`} aria-current={isOn(i.href) ? "page" : undefined}>
          <Icon name={i.icon} size={21} /> {i.label}
        </Link>
      ))}
    </>
  );
}
