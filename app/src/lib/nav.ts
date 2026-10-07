import type { IconName } from "@/components/icons";
import type { Role } from "@/lib/data/context";

export interface NavItem {
  icon: IconName;
  label: string;
  href: string;
}

/** Bottom navigation per role: the same five-or-fewer tabs as the prototype. */
export const NAV: Record<Role, NavItem[]> = {
  gm: [
    { icon: "home", label: "Home", href: "/home" },
    { icon: "brief", label: "Brief", href: "/brief" },
    { icon: "fnb", label: "F&B", href: "/live" },
    { icon: "roster", label: "Roster", href: "/roster" },
    { icon: "night", label: "Tonight", href: "/tonight" },
  ],
  fnb_mgr: [
    { icon: "brief", label: "Brief", href: "/brief" },
    { icon: "fnb", label: "Plan", href: "/plan" },
    { icon: "mic", label: "Live", href: "/live" },
    { icon: "esg", label: "Waste", href: "/waste" },
    { icon: "roster", label: "Roster", href: "/roster" },
  ],
  chef: [
    { icon: "fnb", label: "Plan", href: "/plan" },
    { icon: "mic", label: "Live", href: "/live" },
    { icon: "esg", label: "Waste", href: "/waste" },
    { icon: "brief", label: "Brief", href: "/brief" },
  ],
  sous_chef: [
    { icon: "fnb", label: "Plan", href: "/plan" },
    { icon: "mic", label: "Live", href: "/live" },
    { icon: "esg", label: "Waste", href: "/waste" },
  ],
  prep_cook: [
    { icon: "fnb", label: "Plan", href: "/plan" },
    { icon: "mic", label: "Live", href: "/live" },
  ],
  hk: [
    { icon: "rooms", label: "Rooms", href: "/rooms" },
    { icon: "maint", label: "Maint.", href: "/faults" },
  ],
  eng: [
    { icon: "maint", label: "Maint.", href: "/faults" },
    { icon: "rooms", label: "Rooms", href: "/rooms" },
  ],
  auditor: [
    { icon: "esg", label: "ESG", href: "/waste" },
    { icon: "night", label: "Reports", href: "/tonight" },
    { icon: "brief", label: "Brief", href: "/brief" },
  ],
  admin: [
    { icon: "home", label: "Home", href: "/home" },
    { icon: "brief", label: "Brief", href: "/brief" },
    { icon: "fnb", label: "Plan", href: "/plan" },
    { icon: "roster", label: "Roster", href: "/roster" },
    { icon: "settings", label: "Set-up", href: "/settings" },
  ],
  owner: [
    { icon: "port", label: "Portfolio", href: "/portfolio" },
    { icon: "night", label: "Reports", href: "/tonight" },
    { icon: "esg", label: "ESG", href: "/waste" },
  ],
  vp: [
    { icon: "port", label: "Portfolio", href: "/portfolio" },
    { icon: "brief", label: "Brief", href: "/brief" },
    { icon: "fnb", label: "F&B", href: "/live" },
    { icon: "roster", label: "Roster", href: "/roster" },
  ],
  ceo: [
    { icon: "port", label: "Portfolio", href: "/portfolio" },
    { icon: "brief", label: "Brief", href: "/brief" },
    { icon: "esg", label: "ESG", href: "/waste" },
  ],
};

export const ROLE_TAG: Record<Role, string> = { gm: "GM", fnb_mgr: "F&B", chef: "CHEF", sous_chef: "SOUS CHEF", prep_cook: "PREP", hk: "H&K", eng: "ENG", auditor: "AUDIT", admin: "ADMIN", owner: "OWNER", vp: "VP", ceo: "CEO" };

/** Full names for the "View as" menu. */
export const ROLE_NAME: Record<Role, string> = { gm: "General Manager", fnb_mgr: "F&B Manager", chef: "Head Chef", sous_chef: "Sous Chef", prep_cook: "Prep Cook", hk: "Housekeeping", eng: "Engineering", auditor: "Auditor", admin: "Set-up (admin)", owner: "Owner", vp: "Regional VP", ceo: "Group CEO" };

/** Pages reachable through an in-screen tab keep their parent lit in the bottom nav. */
export function activeHref(pathname: string, items: NavItem[]): string | null {
  const exact = items.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  if (exact) return exact.href;
  const family: Record<string, string[]> = { "/plan": ["/live", "/fnb"], "/waste": ["/live", "/esg"], "/live": ["/plan"], "/rooms": [], "/faults": [] };
  for (const [page, parents] of Object.entries(family)) {
    if (pathname.startsWith(page)) {
      const p = parents.find((h) => items.some((i) => i.href === h));
      if (p) return p;
    }
  }
  return null;
}

export function homeFor(role: Role): string {
  return NAV[role]?.[0]?.href ?? "/home";
}
