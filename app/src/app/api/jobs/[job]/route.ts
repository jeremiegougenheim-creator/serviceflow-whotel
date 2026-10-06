import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailyCycle, runDebrief, runEveningBrief, runLiveTick, runNightlyReport, runStaffing } from "@/lib/engine/run";
import { todayIn, plusDays } from "@/lib/format";

// The Hobby plan caps a function at 60 seconds; Pro allows 300. The daily cycle is
// therefore run one hotel at a time (POST with {"property_id": ...}), never all at once.
export const maxDuration = 60;

/**
 * Scheduled jobs. Called by pg_cron (Supabase) or Vercel Cron with the shared secret:
 *   POST /api/jobs/daily     every day; runs each property's cycle at its own local time (see "when")
 *   POST /api/jobs/brief     the evening brief for tomorrow, every property (or ?property=<id>)
 *   POST /api/jobs/dawn      the dawn update for today
 *   POST /api/jobs/debrief   today's debrief
 *   POST /api/jobs/nightly   tonight's report
 *   POST /api/jobs/staffing  hours against demand, two weeks
 *   POST /api/jobs/live      every 15 minutes; the live proposals for every outlet in service now
 * Body (optional JSON): { property_id, date }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.JOBS_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { job } = await params;
  const body = (await request.json().catch(() => ({}))) as { property_id?: string; date?: string; hour?: number };
  const db = createAdminClient();
  const { data: props } = await db.from("properties").select("id, slug, timezone, settings").eq("active", true);
  const targets = (props ?? []).filter((p) => !body.property_id || p.id === body.property_id);
  const results: Record<string, unknown> = {};
  for (const p of targets) {
    const today = body.date ?? todayIn(p.timezone);
    const settings = (p.settings ?? {}) as Record<string, string>;
    try {
      switch (job) {
        case "daily": {
          // when called hourly, run each step at the property's configured local hour
          const hour = body.hour ?? Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: p.timezone }).format(new Date()));
          const at = (key: string, def: string) => Number((settings[key] ?? def).slice(0, 2));
          const r: Record<string, unknown> = {};
          if (hour === at("brief_time", "18:00")) r.brief = await runEveningBrief(db, p.id, plusDays(today, 1), "evening");
          if (hour === at("dawn_update_time", "03:30")) r.dawn = await runEveningBrief(db, p.id, today, "dawn");
          if (hour === at("debrief_time", "12:30")) r.debrief = await runDebrief(db, p.id, today);
          if (hour === 23) r.nightly = await runNightlyReport(db, p.id, today);
          if (body.hour === -1) Object.assign(r, await runDailyCycle(db, p.id, today));
          results[p.slug] = r;
          break;
        }
        case "brief": results[p.slug] = await runEveningBrief(db, p.id, body.date ?? plusDays(today, 1), "evening"); break;
        case "dawn": results[p.slug] = await runEveningBrief(db, p.id, today, "dawn"); break;
        case "debrief": results[p.slug] = await runDebrief(db, p.id, today); break;
        case "nightly": results[p.slug] = await runNightlyReport(db, p.id, today); break;
        case "staffing": results[p.slug] = await runStaffing(db, p.id, today, 14); break;
        case "live": results[p.slug] = await runLiveTick(db, p.id); break;
        case "cycle": results[p.slug] = await runDailyCycle(db, p.id, today); break;
        default: return NextResponse.json({ error: "unknown job" }, { status: 404 });
      }
    } catch (e) {
      results[p.slug] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ job, results });
}
