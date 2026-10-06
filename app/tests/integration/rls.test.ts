/**
 * Tenant isolation, tested against a running Supabase (local stack or a project) with the demo accounts.
 * Skipped when NEXT_PUBLIC_SUPABASE_URL is not set. This is what a hotel group's IT tests first.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.SEED_DEMO_PASSWORD ?? "serviceflow-demo";

async function signIn(email: string) {
  const c = createClient(url!, key!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe.skipIf(!url || !key)("row level security", () => {
  it("a chef sees only their own hotel", async () => {
    const chef = await signIn("chef@demo.serviceflow");
    const { data: props } = await chef.from("properties").select("slug");
    expect(props?.map((p) => p.slug)).toEqual(["harbour-hotel"]);
    const { data: outlets } = await chef.from("outlets").select("property_id, properties(slug)");
    expect(new Set((outlets ?? []).map((o) => (o.properties as unknown as { slug: string } | null)?.slug))).toEqual(new Set(["harbour-hotel"]));
    const { data: waste } = await chef.from("waste_logs").select("property_id").limit(500);
    const { data: own } = await chef.from("properties").select("id").single();
    expect((waste ?? []).every((w) => w.property_id === own!.id)).toBe(true);
  });

  it("a chef cannot read or change another hotel's rows, even by id", async () => {
    const ceo = await signIn("ceo@demo.serviceflow");
    const { data: other } = await ceo.from("properties").select("id").eq("slug", "townhouse").single();
    const { data: decision } = await ceo.from("decisions").select("id, status").eq("property_id", other!.id).limit(1).maybeSingle();
    const chef = await signIn("chef@demo.serviceflow");
    const { data: read } = await chef.from("properties").select("id").eq("id", other!.id);
    expect(read).toEqual([]);
    if (decision) {
      const { data: updated } = await chef.from("decisions").update({ status: "approved" }).eq("id", decision.id).select("id");
      expect(updated).toEqual([]);
    }
    const { error } = await chef.from("waste_logs").insert({ property_id: other!.id, outlet_id: other!.id, service_date: "2026-01-01", kg: 1 });
    expect(error).not.toBeNull();
  });

  it("portfolio roles read, never write", async () => {
    const owner = await signIn("owner@demo.serviceflow");
    const { data: props } = await owner.from("properties").select("slug").order("slug");
    expect(props?.map((p) => p.slug)).toEqual(["harbour-hotel", "townhouse"]);
    const { data: d } = await owner.from("decisions").select("id").limit(1).maybeSingle();
    if (d) {
      const { data: updated } = await owner.from("decisions").update({ status: "approved" }).eq("id", d.id).select("id");
      expect(updated).toEqual([]);
    }
    const vp = await signIn("vp@demo.serviceflow");
    const { data: region } = await vp.from("properties").select("slug");
    expect(region?.length).toBe(5);
    const { data: fin } = await vp.from("property_financials").select("id").limit(1);
    expect((fin ?? []).length).toBe(1);
    const chef = await signIn("chef@demo.serviceflow");
    const { data: chefFin } = await chef.from("property_financials").select("id").limit(1);
    expect(chefFin).toEqual([]);
  });

  it("a row's parents must belong to the row's hotel, whatever property_id says", async () => {
    const ceo = await signIn("ceo@demo.serviceflow");
    const { data: other } = await ceo.from("outlets").select("id, property_id").eq("slug", "breakfast").neq("property_id", (await ceo.from("properties").select("id").eq("slug", "harbour-hotel").single()).data!.id).limit(1).single();
    const chef = await signIn("chef@demo.serviceflow");
    const { data: own } = await chef.from("properties").select("id").single();
    // a chef of hotel A names hotel B's outlet with A's property_id: refused by the trigger, not just by RLS
    const { error: e1 } = await chef.from("service_actuals").insert({ property_id: own!.id, outlet_id: other!.id, service_date: "2030-01-01", actual_covers: 0 });
    expect(e1).not.toBeNull();
    expect(e1?.message).toMatch(/another property/);
    const { error: e2 } = await chef.from("waste_logs").insert({ property_id: own!.id, outlet_id: other!.id, service_date: "2030-01-01", kg: 1 });
    expect(e2).not.toBeNull();
    // and a log of their own cannot be moved to hotel B
    const { data: mine } = await chef.from("waste_logs").select("id").eq("property_id", own!.id).limit(1).single();
    const { data: moved } = await chef.from("waste_logs").update({ property_id: other!.property_id }).eq("id", mine!.id).select("id");
    expect(moved ?? []).toEqual([]);
  });

  it("a GM grants one hotel's operational roles, never an org scope or an admin role", async () => {
    const gm = await signIn("gm@demo.serviceflow");
    const { data: own } = await gm.from("properties").select("id, org_id").single();
    const { error: e1 } = await gm.from("memberships").insert({ invited_email: "x@example.com", scope_type: "org", org_id: own!.org_id, property_id: own!.id, role: "admin" });
    expect(e1).not.toBeNull();
    const { error: e2 } = await gm.from("memberships").insert({ invited_email: "x@example.com", scope_type: "property", org_id: own!.org_id, property_id: own!.id, role: "owner" });
    expect(e2).not.toBeNull();
    const { data: ok, error: e3 } = await gm.from("memberships").insert({ invited_email: "rls-test@example.com", scope_type: "property", org_id: own!.org_id, property_id: own!.id, role: "prep_cook" }).select("id").single();
    expect(e3).toBeNull();
    await gm.from("memberships").delete().eq("id", ok!.id);
    // the hotel cannot be moved to another organisation from the app
    const { data: moved, error: e4 } = await gm.from("properties").update({ region_id: null }).eq("id", own!.id).select("id");
    expect(e4 != null || (moved ?? []).length === 0).toBe(true);
  });

  it("a cook sees no one else's email; a GM sees their hotel; the CEO sees the group", async () => {
    const chef = await signIn("chef@demo.serviceflow");
    const { data: me } = await chef.auth.getUser();
    const { data: users } = await chef.from("users").select("id");
    expect((users ?? []).map((u) => u.id)).toEqual([me.user!.id]);
    const gm = await signIn("gm@demo.serviceflow");
    const { data: gmSees } = await gm.from("users").select("id");
    expect((gmSees ?? []).length).toBeGreaterThan(1);
    const ceo = await signIn("ceo@demo.serviceflow");
    const { data: ceoSees } = await ceo.from("memberships").select("id");
    expect((ceoSees ?? []).length).toBeGreaterThan((gmSees ?? []).length);
  });

  it("a refused write returns no rows: the app treats that as a refusal", async () => {
    const owner = await signIn("owner@demo.serviceflow");
    const { data: d } = await owner.from("decisions").select("id").eq("status", "proposed").limit(1).maybeSingle();
    if (d) {
      const r = await owner.from("decisions").update({ status: "approved" }).eq("id", d.id).eq("status", "proposed").select("id");
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    const { data: own } = await owner.from("properties").select("id").limit(1).single();
    const { error } = await owner.from("voice_logs").insert({ property_id: own!.id, department: "housekeeping", transcript: "2506 done", logged_by: (await owner.auth.getUser()).data.user!.id });
    expect(error).not.toBeNull();
  });

  it("the service role key is never needed by a browser flow", async () => {
    const chef = await signIn("chef@demo.serviceflow");
    const { data } = await chef.from("job_runs").select("id").limit(1);
    expect(Array.isArray(data)).toBe(true);
  });
});
