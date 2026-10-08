/**
 * Run the engine by hand.
 *   npm run engine -- brief <property-slug|all> [date]      evening brief for the date (default tomorrow)
 *   npm run engine -- dawn <property-slug|all> [date]
 *   npm run engine -- debrief <property-slug|all> [date]    (default today)
 *   npm run engine -- nightly <property-slug|all> [date]
 *   npm run engine -- staffing <property-slug|all> [from] [days]
 *   npm run engine -- live <property-slug> <outlet-slug> <date> <HH:MM>
 *   npm run engine -- tick <property-slug|all>                  the live tick for every outlet in service now
 *   npm run engine -- backtest <property-slug|all> [to]        replay the forecast over the past (out of sample)
 */
import { adminDb, plusDays, today } from "./_db";
import { backtestProperty } from "../src/lib/data/backtest";
import { runDebrief, runEveningBrief, runLive, runLiveTick, runNightlyReport, runStaffing } from "../src/lib/engine/run";

async function main() {
  const [cmd, slug = "all", a, b] = process.argv.slice(2);
  const db = adminDb();
  const { data: props } = await db.from("properties").select("id, slug").eq("active", true);
  const targets = (props ?? []).filter((p) => slug === "all" || p.slug === slug);
  if (!targets.length) throw new Error(`no property matches ${slug}`);
  for (const p of targets) {
    switch (cmd) {
      case "brief": console.log(await runEveningBrief(db, p.id, a ?? plusDays(today(), 1), "evening")); break;
      case "dawn": console.log(await runEveningBrief(db, p.id, a ?? today(), "dawn")); break;
      case "debrief": console.log(await runDebrief(db, p.id, a ?? today())); break;
      case "nightly": console.log(await runNightlyReport(db, p.id, a ?? today())); break;
      case "staffing": console.log(await runStaffing(db, p.id, a ?? today(), b ? Number(b) : 14)); break;
      case "tick": console.log(await runLiveTick(db, p.id)); break;
      case "backtest": {
        const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
        for (const r of await backtestProperty(db, p.id, a ?? plusDays(today(), -1))) {
          const s = r.summary;
          if (!s) { console.log(`${p.slug} · ${r.outlet.name}: not enough history`); continue; }
          console.log(`${p.slug} · ${s.outletName} · ${s.from} → ${s.to} · ${s.n} days (after ${s.warmup} days of warm-up)`);
          console.log(`  ServiceFlow  MAPE ${pct(s.engine.mape)}  MAE ${s.engine.mae.toFixed(1)}  bias ${pct(s.engine.bias)}  within range ${pct(s.withinBand)}`);
          console.log(`  Habit        MAPE ${pct(s.habit.mape)}  MAE ${s.habit.mae.toFixed(1)}  bias ${pct(s.habit.bias)}  · closer than habit ${s.closerThanHabit}/${s.n}`);
          if (s.simple) console.log(`  ${s.simpleLabel}: MAPE ${pct(s.simple.baseline.mape)} vs ServiceFlow ${pct(s.simple.engine.mape)} on the same ${s.simple.n} days · closer ${s.closerThanSimple}/${s.simple.n}`);
        }
        break;
      }
      case "live": {
        const { data: o } = await db.from("outlets").select("id").eq("property_id", p.id).eq("slug", a!).single();
        console.log(await runLive(db, p.id, o!.id, b ?? today(), process.argv[6] ?? "08:00"));
        break;
      }
      default: throw new Error("unknown command");
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
