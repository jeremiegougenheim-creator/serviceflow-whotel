import { NextResponse, type NextRequest } from "next/server";
import { backtestProperty } from "@/lib/data/backtest";
import { getContext } from "@/lib/data/context";
import { MODEL_VERSION } from "@/lib/engine/version";
import { plusDays } from "@/lib/format";
import { BACKTEST_ROLES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

/**
 * The replay, one row a day, for whoever wants to check it in their own spreadsheet.
 * The signed-in user's client: RLS keeps it to their hotel. Aggregates only, no guest data.
 */
export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!BACKTEST_ROLES.includes(ctx.role)) return new NextResponse("Not available for this role", { status: 403 });
  const slug = req.nextUrl.searchParams.get("outlet");
  const supabase = await createClient();
  const results = await backtestProperty(supabase, ctx.property.id, plusDays(ctx.today, -1));
  const r = results.find((x) => x.outlet.slug === slug && x.summary) ?? results.find((x) => x.summary);
  if (!r) return new NextResponse("Not enough history", { status: 404 });
  const esc = (v: string | number | null) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ["date", "actual_covers", "serviceflow_p50", "serviceflow_p10", "serviceflow_p90", "habit", r.summary!.simpleLabel.toLowerCase().replace(/[^a-z]+/g, "_"), "biggest_signal"];
  const lines = r.points.map((p) => [p.date, p.actual, p.p50, p.p10, p.p90, p.habit, p.simple, p.driver].map(esc).join(","));
  const body = [`# ServiceFlow backtest · ${ctx.property.name} · ${r.outlet.name} · model ${MODEL_VERSION} · walk-forward, out of sample`, head.join(","), ...lines].join("\n") + "\n";
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="backtest-${ctx.property.slug}-${r.outlet.slug}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
