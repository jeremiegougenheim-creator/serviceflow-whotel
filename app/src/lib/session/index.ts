import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Role = "gm" | "fnb_mgr" | "chef" | "sous_chef" | "prep_cook" | "hk" | "eng" | "auditor" | "admin" | "owner" | "vp" | "ceo";
export const PORTFOLIO_ROLES: Role[] = ["owner", "vp", "ceo"];
const ROLE_RANK: Role[] = ["admin", "gm", "fnb_mgr", "chef", "sous_chef", "hk", "eng", "prep_cook", "auditor", "ceo", "vp", "owner"];

export interface PropertyAccess {
  property: Tables<"properties">;
  roles: Role[];
}

export interface Session {
  userId: string;
  email: string;
  fullName: string | null;
  memberships: Tables<"memberships">[];
  properties: PropertyAccess[];
  /** the property in view */
  property: Tables<"properties"> | null;
  /** the role used for navigation on that property */
  role: Role;
  roles: Role[];
  /** portfolio scope, when the user has one */
  scope: { type: "org" | "region" | "properties"; label: string; count: number } | null;
}

export const PROPERTY_COOKIE = "sf_property";

/** The signed-in user, their properties and the role in view. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: memberships }, { data: properties }, { data: profile }] = await Promise.all([
    supabase.from("memberships").select("*").eq("user_id", user.id).eq("active", true),
    supabase.from("properties").select("*").eq("active", true).order("name"),
    supabase.from("users").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const ms = memberships ?? [];
  const access: PropertyAccess[] = (properties ?? []).map((p) => {
    const roles = ms
      .filter((m) => (m.scope_type === "property" && m.property_id === p.id) || (m.scope_type === "region" && m.region_id === p.region_id) || (m.scope_type === "org" && m.org_id === p.org_id))
      .map((m) => m.role as Role);
    return { property: p, roles: [...new Set(roles)].sort((a, b) => ROLE_RANK.indexOf(a) - ROLE_RANK.indexOf(b)) };
  });

  const cookieStore = await cookies();
  const wanted = cookieStore.get(PROPERTY_COOKIE)?.value;
  const current = access.find((a) => a.property.id === wanted) ?? access[0] ?? null;
  const roles = current?.roles ?? [];
  const allRoles = [...new Set(ms.map((m) => m.role as Role))];
  // portfolio roles lead with the portfolio; a GM with a portfolio role still lands on the hotel
  const role: Role = roles.find((r) => !PORTFOLIO_ROLES.includes(r)) ?? roles[0] ?? allRoles[0] ?? "gm";

  let scope: Session["scope"] = null;
  const org = ms.find((m) => m.scope_type === "org");
  const region = ms.find((m) => m.scope_type === "region");
  if (org && PORTFOLIO_ROLES.includes(org.role as Role)) scope = { type: "org", label: "Group", count: access.length };
  else if (region && PORTFOLIO_ROLES.includes(region.role as Role)) scope = { type: "region", label: "Region", count: access.filter((a) => a.property.region_id === region.region_id).length };
  else if (ms.filter((m) => PORTFOLIO_ROLES.includes(m.role as Role)).length) scope = { type: "properties", label: "Portfolio", count: access.filter((a) => a.roles.some((r) => PORTFOLIO_ROLES.includes(r))).length };

  return { userId: user.id, email: user.email ?? "", fullName: profile?.full_name ?? null, memberships: ms, properties: access, property: current?.property ?? null, role, roles, scope };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("not signed in");
  return s;
}

export function can(session: Session, ...roles: Role[]): boolean {
  return session.roles.includes("admin") || roles.some((r) => session.roles.includes(r));
}
