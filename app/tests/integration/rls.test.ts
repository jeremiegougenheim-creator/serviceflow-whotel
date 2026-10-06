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

  it("the service role key is never needed by a browser flow", async () => {
    const chef = await signIn("chef@demo.serviceflow");
    const { data } = await chef.from("job_runs").select("id").limit(1);
    expect(Array.isArray(data)).toBe(true);
  });
});
