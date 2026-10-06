/**
 * Seed the demo accounts and run the engine over the illustrative data.
 *   1. supabase/seed.sql must have run (tables, hotels, history).
 *   2. npm run seed  → creates the demo users (password SEED_DEMO_PASSWORD) and attaches memberships,
 *      then produces today's and tomorrow's plans, today's live events, debrief and nightly report.
 * Re-runnable.
 */
import { adminDb, plusDays, today } from "./_db";
import { loadProperty, runDebrief, runEveningBrief, runLive, runNightlyReport, runStaffing } from "../src/lib/engine/run";
import { expectedSeatedAt } from "../src/lib/engine/live";
import type { CoversForecast } from "../src/lib/engine/types";

const DEMO = [
  ["gm@demo.serviceflow", "General Manager"],
  ["chef@demo.serviceflow", "Head Chef"],
  ["hk@demo.serviceflow", "Executive Housekeeper"],
  ["eng@demo.serviceflow", "Chief Engineer"],
  ["owner@demo.serviceflow", "Owner"],
  ["vp@demo.serviceflow", "Regional VP"],
  ["ceo@demo.serviceflow", "Group CEO"],
  ["admin@demo.serviceflow", "ServiceFlow admin"],
] as const;

async function main() {
  const db = adminDb();
  const password = process.env.SEED_DEMO_PASSWORD ?? "serviceflow-demo";

  // 1. users (the auth trigger mirrors them into public.users and attaches invited memberships)
  const { data: existing } = await db.auth.admin.listUsers({ perPage: 200 });
  for (const [email, name] of DEMO) {
    const found = existing?.users.find((u) => u.email === email);
    if (found) {
      await db.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: { full_name: name } });
      await db.from("memberships").update({ user_id: found.id }).is("user_id", null).ilike("invited_email", email);
      continue;
    }
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
  }
  console.log("users ready");

  // 2. the engine over the demo days
  const { data: props } = await db.from("properties").select("id, slug, name, timezone").eq("active", true).order("name");
  for (const p of props ?? []) {
    const t = today(p.timezone);
    const main = p.slug === "harbour-hotel";
    // today: evening brief as it would have been issued yesterday, then the dawn update
    await runEveningBrief(db, p.id, t, "manual");
    if (main) {
      await runEveningBrief(db, p.id, t, "dawn");
      const { data: bf } = await db.from("outlets").select("id").eq("property_id", p.id).eq("slug", "breakfast").single();
      if (bf) {
        // the illustrative close: the service ran 5.6% above the forecast, within the range
        const { data: f } = await db.from("v_latest_forecasts").select("*").eq("outlet_id", bf.id).eq("service_date", t).maybeSingle();
        if (f?.covers_p50) {
          const actual = Math.round(f.covers_p50 * 1.056);
          await db.from("service_actuals").update({ actual_covers: actual }).eq("outlet_id", bf.id).eq("service_date", t);
          // the pace ran ahead of the forecast all morning: cumulative covers from the engine's own curve
          const ctx = await loadProperty(db, p.id);
          const outlet = ctx.outlets.find((o) => o.id === bf.id)!;
          const fc = { p10: f.covers_p10!, p50: f.covers_p50, p90: f.covers_p90!, usual: f.usual_covers ?? f.covers_p50, occupancy: null, waveSplit: (f.wave_split as unknown as CoversForecast["waveSplit"]) ?? [], drivers: [], signalsRead: 0, inputs: {}, headline: "", subline: "" } as CoversForecast;
          await db.from("pos_pace").delete().eq("outlet_id", bf.id).eq("service_date", t);
          const points: [string, number][] = [["07:00", 1.09], ["07:30", 1.11], ["08:12", 1.09], ["09:00", 1.07], ["09:40", 1.06], ["10:30", 1.056]];
          for (const [clock, k] of points) {
            const n = clock === "10:30" ? actual : Math.round(expectedSeatedAt(fc, outlet, clock) * k);
            await db.from("pos_pace").insert({ property_id: p.id, outlet_id: bf.id, service_date: t, at: new Date(`${t}T${clock}:00+08:00`).toISOString(), covers_seated: n, source: "pos" });
          }
        }
        for (const clock of ["07:30", "08:12", "09:40"]) await runLive(db, p.id, bf.id, t, clock);
      }
    }
    await runDebrief(db, p.id, t);
    await runDebrief(db, p.id, plusDays(t, -1));
    // tomorrow's brief, staffing for two weeks, tonight's report
    await runEveningBrief(db, p.id, plusDays(t, 1), "evening");
    await runStaffing(db, p.id, plusDays(t, -7), 21);
    await runNightlyReport(db, p.id, t);
    console.log("engine ran for", p.name);
  }
  console.log("seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
