import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { USER_EMAIL_HEADER, USER_ID_HEADER } from "@/lib/supabase/proxy";
import type { Tables } from "@/lib/supabase/database.types";
import { nowClock, todayIn } from "@/lib/format";

export type Role = Tables<"memberships">["role"];
export const PORTFOLIO_ROLES: Role[] = ["owner", "vp", "ceo"];

export interface Membership {
  id: string;
  role: Role;
  scope_type: "property" | "region" | "org";
  org_id: string;
  region_id: string | null;
  property_id: string | null;
}

export interface AppContext {
  userId: string;
  email: string;
  fullName: string | null;
  memberships: Membership[];
  /** every property the user can see, in display order */
  properties: Pick<Tables<"properties">, "id" | "name" | "slug" | "keys" | "timezone" | "currency" | "region_id" | "settings">[];
  property: Pick<Tables<"properties">, "id" | "name" | "slug" | "keys" | "timezone" | "currency" | "region_id" | "settings">;
  /** active outlets of the selected property, in display order */
  outlets: Tables<"outlets">[];
  /** the role used for navigation and permissions on the selected property */
  role: Role;
  roles: Role[];
  /** every role the user holds on the selected property, before any "view as" choice */
  heldRoles: Role[];
  isPortfolio: boolean;
  scopeLabel: string;
  today: string;
  clock: string;
}

const PROPERTY_COOKIE = "sf_property";
const ROLE_COOKIE = "sf_role";

type PropertyRow = AppContext["properties"][number];

interface ContextPayload {
  user: { id: string; email: string; full_name: string | null } | null;
  memberships: Membership[];
  properties: PropertyRow[];
  outlets: Tables<"outlets">[];
  unread: number;
}

/**
 * Who is signed in, what they belong to, what they can see — in one call.
 * The proxy has already validated the session and passes the user in a request header;
 * the database returns profile, memberships, properties and the unread count through
 * sf_context() (RLS applies: it runs as the caller). Before that function exists, the
 * same four queries run in parallel.
 */
const loadContext = cache(async (): Promise<ContextPayload> => {
  const supabase = await createClient();
  const h = await headers();
  let userId = h.get(USER_ID_HEADER);
  let email = h.get(USER_EMAIL_HEADER) ?? "";
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    userId = user.id;
    email = user.email ?? "";
  }

  const rpc = await supabase.rpc("sf_context");
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const d = rpc.data as unknown as Partial<ContextPayload>;
    return {
      user: d.user ?? { id: userId, email, full_name: null },
      memberships: d.memberships ?? [],
      properties: d.properties ?? [],
      outlets: d.outlets ?? [],
      unread: Number(d.unread ?? 0),
    };
  }

  const [{ data: profile }, { data: memberships }, { data: properties }, { data: outlets }, { count }] = await Promise.all([
    supabase.from("users").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("memberships").select("id, role, scope_type, org_id, region_id, property_id").eq("user_id", userId).eq("active", true),
    supabase.from("properties").select("id, name, slug, keys, timezone, currency, region_id, settings").eq("active", true).order("name"),
    supabase.from("outlets").select("*").eq("active", true).order("sort_order"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  return {
    user: { id: userId, email, full_name: profile?.full_name ?? null },
    memberships: (memberships ?? []) as Membership[],
    properties: properties ?? [],
    outlets: outlets ?? [],
    unread: count ?? 0,
  };
});

/** Unread notifications for the badge; shares the context call. */
export async function getUnreadCount(): Promise<number> {
  return (await loadContext()).unread;
}

/** Session, memberships and the selected property. Cached per request. */
export const getContext = cache(async (): Promise<AppContext> => {
  const { user, memberships, properties, outlets } = await loadContext();
  if (!user) redirect("/login");
  const ms = memberships;
  const props = properties;
  if (!ms.length || !props.length) redirect("/welcome");

  const cookieStore = await cookies();
  const wanted = cookieStore.get(PROPERTY_COOKIE)?.value;
  const property = props.find((p) => p.id === wanted) ?? props[0];

  const rolesFor = (propertyId: string, regionId: string | null) =>
    ms.filter((m) => (m.scope_type === "property" && m.property_id === propertyId) || (m.scope_type === "region" && m.region_id === regionId) || m.scope_type === "org").map((m) => m.role);
  const heldRoles = [...new Set(rolesFor(property.id, property.region_id))];
  // the most operational role first: a chef who is also owner lands on the plan
  const order: Role[] = ["chef", "sous_chef", "prep_cook", "fnb_mgr", "gm", "hk", "eng", "auditor", "admin", "vp", "ceo", "owner"];
  heldRoles.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  // "View as": someone holding several roles picks the one in view. The screens then offer
  // only what that role may do; the database still decides every write.
  const viewAs = cookieStore.get(ROLE_COOKIE)?.value as Role | undefined;
  const chosen = viewAs && heldRoles.includes(viewAs) ? viewAs : null;
  const role = chosen ?? heldRoles[0] ?? "auditor";
  const roles = chosen ? [chosen] : heldRoles;
  const isPortfolio = chosen ? PORTFOLIO_ROLES.includes(chosen) : PORTFOLIO_ROLES.includes(role) || ms.some((m) => m.scope_type !== "property" && PORTFOLIO_ROLES.includes(m.role));

  let scopeLabel = property.name.toUpperCase();
  const top = ms.find((m) => m.scope_type === "org" && PORTFOLIO_ROLES.includes(m.role)) ?? ms.find((m) => m.scope_type === "region" && PORTFOLIO_ROLES.includes(m.role));
  if (chosen && !PORTFOLIO_ROLES.includes(chosen)) scopeLabel = property.name.toUpperCase();
  else if (role === "ceo" || (!chosen && top?.scope_type === "org")) scopeLabel = `GROUP · ${props.length} HOTELS`;
  else if (role === "vp" || (!chosen && top?.scope_type === "region")) scopeLabel = `REGION · ${props.filter((p) => p.region_id === property.region_id).length} HOTELS`;
  else if (role === "owner") scopeLabel = `PORTFOLIO · ${props.length} HOTEL${props.length > 1 ? "S" : ""}`;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    memberships: ms,
    properties: props,
    property,
    outlets: outlets.filter((o) => o.property_id === property.id).sort((a, b) => a.sort_order - b.sort_order),
    role,
    roles,
    heldRoles,
    isPortfolio,
    scopeLabel,
    today: todayIn(property.timezone),
    clock: nowClock(property.timezone),
  };
});

export function can(ctx: AppContext, ...roles: Role[]): boolean {
  return ctx.roles.includes("admin") || roles.some((r) => ctx.roles.includes(r));
}

/** Who may write where: the same lists as the row level security policies, so a screen never offers a tap the database refuses. */
export const WRITES = {
  decisions: ["gm", "fnb_mgr", "chef", "sous_chef", "hk", "eng"],
  plans: ["gm", "fnb_mgr", "chef", "sous_chef", "prep_cook"],
  confirm_plan: ["gm", "fnb_mgr", "chef"],
  live_events: ["gm", "fnb_mgr", "chef", "sous_chef"],
  waste_logs: ["gm", "fnb_mgr", "chef", "sous_chef", "prep_cook"],
  service_actuals: ["gm", "fnb_mgr", "chef", "sous_chef"],
  room_tasks: ["gm", "hk"],
  work_orders: ["gm", "eng"],
  work_orders_raise: ["gm", "eng", "hk", "fnb_mgr", "chef", "sous_chef"],
  planned_works: ["gm", "eng"],
  roster_suggestions: ["gm", "fnb_mgr", "chef", "hk"],
  pos_variances: ["gm", "fnb_mgr"],
} as const satisfies Record<string, readonly Role[]>;

export function mayWrite(ctx: AppContext, what: keyof typeof WRITES): boolean {
  return can(ctx, ...WRITES[what]);
}

export const PROPERTY_COOKIE_NAME = PROPERTY_COOKIE;
export const ROLE_COOKIE_NAME = ROLE_COOKIE;
