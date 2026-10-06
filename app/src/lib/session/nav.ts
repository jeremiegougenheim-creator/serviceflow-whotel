import type { Role } from "./index";

export interface NavItem {
  icon: string;
  label: string;
  href: string;
}

/** Bottom navigation per role: the prototype's tabs, one to one. */
export function navFor(role: Role, hasPortfolio: boolean): NavItem[] {
  const base: Record<string, NavItem[]> = {
    gm: [
      { icon: "home", label: "Home", href: "/home" },
      { icon: "brief", label: "Brief", href: "/brief" },
      { icon: "fnb", label: "F&B", href: "/live" },
      { icon: "roster", label: "Roster", href: "/roster" },
      { icon: "night", label: "Tonight", href: "/tonight" },
    ],
    chef: [
      { icon: "fnb", label: "Plan", href: "/plan" },
      { icon: "mic", label: "Live", href: "/live" },
      { icon: "esg", label: "Waste", href: "/waste" },
      { icon: "brief", label: "Brief", href: "/brief" },
    ],
    hk: [
      { icon: "rooms", label: "Rooms", href: "/rooms" },
      { icon: "maint", label: "Maint.", href: "/maintenance" },
    ],
    eng: [
      { icon: "maint", label: "Maint.", href: "/maintenance" },
      { icon: "rooms", label: "Rooms", href: "/rooms" },
    ],
    owner: [
      { icon: "port", label: "Portfolio", href: "/portfolio" },
      { icon: "brief", label: "Reports", href: "/tonight" },
      { icon: "esg", label: "ESG", href: "/waste" },
    ],
    vp: [
      { icon: "port", label: "Portfolio", href: "/portfolio?lens=ops" },
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
  base.fnb_mgr = base.gm;
  base.sous_chef = base.chef;
  base.prep_cook = [
    { icon: "fnb", label: "Plan", href: "/plan" },
    { icon: "mic", label: "Live", href: "/live" },
    { icon: "esg", label: "Waste", href: "/waste" },
  ];
  base.auditor = [
    { icon: "esg", label: "ESG", href: "/waste" },
    { icon: "night", label: "Reports", href: "/tonight" },
  ];
  base.admin = [...base.gm, { icon: "settings", label: "Setup", href: "/settings" }];
  const items = base[role] ?? base.gm;
  if (hasPortfolio && !items.some((i) => i.href.startsWith("/portfolio"))) return [{ icon: "port", label: "Portfolio", href: "/portfolio" }, ...items];
  return items;
}

export function homeFor(role: Role, hasPortfolio: boolean): string {
  return navFor(role, hasPortfolio)[0]?.href ?? "/home";
}

export const ROLE_TAG: Record<Role, string> = { gm: "GM", fnb_mgr: "F&B", chef: "CHEF", sous_chef: "SOUS CHEF", prep_cook: "PREP", hk: "H&K", eng: "ENG", auditor: "AUDIT", admin: "ADMIN", owner: "OWNER", vp: "VP", ceo: "CEO" };
