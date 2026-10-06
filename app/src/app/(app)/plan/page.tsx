import { ActionButton } from "@/components/action-button";
import { Card, Empty, Note, ScreenHead, Strike, Tabs } from "@/components/ui";
import { confirmPlan } from "@/lib/actions/ops";
import { getContext } from "@/lib/data/context";
import { getDayWaste, getDecisions, getForecastVersions, getOutlets, getPlanLines, getWeekWaste, groupPlan, inputs, serviceDateFor, waveSplit, type Outlet } from "@/lib/data/fnb";
import { kg, num, signed, timeShort, weekday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plan" };

const ACTION: Record<Outlet["outlet_type"], [string, string]> = {
  breakfast: ["Confirm the plan", "Plan confirmed"],
  restaurant: ["Approve the pars", "Pars approved"],
  bar: ["Approve the batches", "Batches approved"],
  banquet: ["Approve the counts", "Counts approved"],
  room_service: ["Confirm the plan", "Plan confirmed"],
  other: ["Confirm the plan", "Plan confirmed"],
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ outlet?: string; date?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const outlets = await getOutlets(ctx);
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets.find((o) => o.outlet_type === "breakfast") ?? outlets[0];
  if (!outlet) return <Empty>No outlet configured yet. Add one in Set-up.</Empty>;
  const date = sp.date ?? serviceDateFor(ctx, outlet);
  const versions = await getForecastVersions(outlet.id, date);
  const f = versions[0] ?? null;
  const previous = versions[1] ?? null;
  const lines = f ? await getPlanLines(f.id) : [];
  const groups = groupPlan(lines);
  const waves = waveSplit(f);
  const meta = inputs(f);
  const [weekWaste, ydayWaste, decisions] = await Promise.all([getWeekWaste(outlet.id, date), getDayWaste(outlet.id, previousDay(date)), getDecisions(ctx, date, { outletId: outlet.id, source: ["engine"] })]);
  const topDecision = decisions.find((d) => d.kind === "trim") ?? decisions[0];
  const confirmed = f?.status === "confirmed" || (groups.length > 0 && groups.every((g) => g.status !== "proposed"));
  const [label, done] = ACTION[outlet.outlet_type];
  const tabs = outlets.map((o) => ({ key: o.slug, label: o.name, href: `/plan?outlet=${o.slug}` }));

  // banquet context
  const supabase = await createClient();
  const banquet = outlet.outlet_type === "banquet" ? (await supabase.from("banquet_events").select("*").eq("outlet_id", outlet.id).eq("service_date", date).neq("status", "cancelled").limit(1).maybeSingle()).data : null;

  return (
    <>
      <Tabs items={tabs} current={outlet.slug} />
      {!f ? (
        <>
          <ScreenHead hi={<>{outlet.name}</>} sub={`${weekday(date)} · no plan yet`} />
          <Empty>The plan for {weekday(date)} is built at the brief hour from the PMS and the bookings. Nothing to prepare yet.</Empty>
        </>
      ) : outlet.outlet_type === "breakfast" ? (
        <>
          <Strike
            eyebrow={previous ? `Updated ${timeShort((ctx.property.settings as Record<string, string>)?.dawn_update_time ?? "03:30")} · ${f.covers_p50 === previous.covers_p50 ? "no change" : signed(f.covers_p50 - previous.covers_p50, " covers")}` : `${weekday(date)} · ${f.covers_p50} covers`}
            title={topDecision ? `${topDecision.title}.` : `${f.covers_p50} covers, ${waves.length} waves.`}
            tiles={[
              { b: waves[0]?.covers ?? f.covers_p50, s: `${timeShort(waves[0]?.startsAt ?? outlet.opens_at)} open` },
              { b: waves[1] ? `+${waves[1].covers}` : "—", s: `${timeShort(waves[1]?.startsAt ?? "")} wave` },
              { b: <>{num(ydayWaste, 1)}<small>kg</small></>, s: "waste yday" },
            ]}
            action={confirmed ? <span className="btn btn-done">{done}</span> : <ActionButton action={confirmPlan.bind(null, f.id)} label={label} done={done} />}
          />
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Station prep</h2>
            <span className="muted text-[12.5px]">{f.covers_p50} covers</span>
          </div>
          <Card>
            {groups.map((g) => (
              <div key={g.station.id} className="row">
                <div className="t min-w-0">
                  <b>{g.station.name}</b>
                  <span>
                    {g.lines.map((l, i) => `${i === 0 ? "" : " · "}${i === 0 ? num(l.qty, 0) : "+" + num(l.qty, 0)}${i === 0 ? "" : " at " + timeShort(l.waves?.starts_at ?? "")}`)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="q">
                    {num(g.total, 0)}
                    {g.station.unit !== "portions" ? <small className="ml-1 text-[13px] text-gold-light">{g.station.unit}</small> : null}
                  </div>
                  <span className={`pill ${g.deltaPct == null ? "pill-mt" : g.deltaPct > 0 ? "pill-gn" : g.deltaPct < 0 ? "pill-am" : "pill-mt"}`}>{g.deltaPct == null ? "" : g.deltaPct === 0 ? "on par" : signed(g.deltaPct, "%")}</span>
                </div>
              </div>
            ))}
          </Card>
          <Note>Every quantity is tomorrow&rsquo;s covers through the station&rsquo;s own history and the mix in house. The chef confirms; nothing changes without him.</Note>
        </>
      ) : outlet.outlet_type === "banquet" ? (
        <>
          <Strike
            eyebrow={String(meta.headline ?? outlet.name)}
            title="Cook to the final count."
            tiles={[
              { b: num(f.covers_p10), s: "confirmed" },
              { b: num(f.covers_p50), s: "to cook" },
              { b: num(Number(meta.diets ?? 0)), s: "diets" },
            ]}
            action={confirmed ? <span className="btn btn-done">{done}</span> : <ActionButton action={confirmPlan.bind(null, f.id)} label={label} done={done} />}
          />
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Courses</h2>
            <span className="muted text-[12.5px]">
              {f.covers_p50} of {banquet?.booked_count ?? f.covers_p90} booked
            </span>
          </div>
          <Card>
            {groups.map((g) => (
              <div key={g.station.id} className="row">
                <div className="t min-w-0">
                  <b>{g.station.name}</b>
                  <span>{g.reason}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="q">{num(g.total)}</div>
                  <span className="pill pill-mt">{g.reason && /by rsvp/i.test(g.reason) ? "by RSVP" : "on count"}</span>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <>
          <Strike
            eyebrow={String(meta.headline ?? `${outlet.name} tomorrow`)}
            title={outlet.outlet_type === "bar" ? "Batched to the night, not the week." : "Prepped to the forecast."}
            tiles={[
              { b: num(f.covers_p50), s: "covers" },
              { b: num(Number(meta.peakCovers ?? waves.at(-1)?.covers ?? 0)), s: `at ${timeShort(String(meta.peakAt ?? waves.at(-1)?.startsAt ?? ""))}` },
              { b: <>{num(weekWaste, 1)}<small>kg</small></>, s: "week waste" },
            ]}
            action={confirmed ? <span className="btn btn-done">{done}</span> : <ActionButton action={confirmPlan.bind(null, f.id)} label={label} done={done} />}
          />
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">{outlet.outlet_type === "bar" ? "Batch pars" : "Prep pars"}</h2>
            <span className="muted text-[12.5px]">{outlet.outlet_type === "bar" ? "Perishables" : "High-value dishes"}</span>
          </div>
          <Card>
            {groups
              .filter((g) => outlet.outlet_type !== "restaurant" || g.station.high_value || groups.length <= 6)
              .map((g) => (
                <div key={g.station.id} className="row">
                  <div className="t min-w-0">
                    <b>{g.station.name}</b>
                    <span>
                      usually {num(g.usual, g.station.unit === "L" ? 0 : 0)}{g.station.unit !== "portions" ? ` ${g.station.unit}` : ""} · {g.reason}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="q">{num(g.total, g.station.unit === "L" ? 0 : 0)}</div>
                    <span className={`pill ${g.deltaPct == null || g.deltaPct === 0 ? "pill-mt" : g.deltaPct > 0 ? "pill-gn" : "pill-am"}`}>
                      {g.deltaPct == null || g.deltaPct === 0 ? "on par" : g.station.unit === "L" ? signed(Math.round(g.total - g.usual), " L") : signed(Math.round(g.total - g.usual))}
                    </span>
                  </div>
                </div>
              ))}
          </Card>
        </>
      )}
      {f ? (
        <p className="muted mt-4 text-[12.5px]">
          {weekday(date)} · version {f.version} ({f.kind}) · {f.signals_read} signals · {kg(ydayWaste)} logged yesterday
        </p>
      ) : null}
    </>
  );
}

function previousDay(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
