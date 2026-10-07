import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Card, Grid, Kpi, Row, ScreenHead, SectionHead } from "@/components/ui";
import { approveDecision, rejectDecision } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { drivers, getDecisions, getLatestForecast, getOutlets, getPms, getStaffingWeek } from "@/lib/data/fnb";
import { greeting, money, plusDays, signed, timeShort, typo, weekday, mondayOf } from "@/lib/format";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await getContext();
  const tomorrow = plusDays(ctx.today, 1);
  const outlets = await getOutlets(ctx);
  const breakfast = outlets.find((o) => o.outlet_type === "breakfast") ?? outlets[0];
  const [f, pmsT, pmsToday, decisions, staffing] = await Promise.all([
    breakfast ? getLatestForecast(breakfast.id, tomorrow) : null,
    getPms(ctx, tomorrow),
    getPms(ctx, ctx.today),
    getDecisions(ctx, tomorrow, { source: ["engine", "nightly"] }).then((ds) => [...ds].sort((a, b) => (a.outlet_id === breakfast?.id ? -1 : 1) - (b.outlet_id === breakfast?.id ? -1 : 1) || a.rank - b.rank)),
    getStaffingWeek(ctx, mondayOf(tomorrow)),
  ]);
  const occT = pmsT?.rooms_total ? pmsT.rooms_occupied / pmsT.rooms_total : null;
  const occ0 = pmsToday?.rooms_total ? pmsToday.rooms_occupied / pmsToday.rooms_total : null;
  const kitchen = staffing.filter((s) => s.service_date === tomorrow && s.department === "kitchen");
  const kitchenDelta = kitchen.reduce((s, x) => s + Number(x.delta_hours ?? 0), 0);
  const settings = (ctx.property.settings ?? {}) as Record<string, string>;
  const briefTime = settings.brief_time ?? "18:00";
  const open = decisions.filter((d) => d.status === "proposed");
  const ready = open.filter((d) => d.outlet_id === breakfast?.id).length || open.length;
  const busy = occT != null && occT >= 0.88 ? "busy " : "";

  return (
    <>
      <ScreenHead
        hi={
          <>
            {greeting(ctx.clock)}, <em>{busy}{weekday(tomorrow)}.</em>
          </>
        }
        sub={f ? `${f.covers_p50} covers forecast · ${ready} decision${ready === 1 ? "" : "s"} ready` : "No forecast yet for tomorrow"}
      />
      <Grid>
        <Kpi k="Covers fcst" v={f?.covers_p50 ?? "—"} n={f ? `range ${f.covers_p10}–${f.covers_p90}` : "runs at " + briefTime} />
        <Kpi k="Occupancy" v={occT != null ? <>{Math.round(occT * 100)}<small>%</small></> : "—"} n={occT != null && occ0 != null ? `${signed(Math.round((occT - occ0) * 100), " pts")} on today` : undefined} />
        <Kpi k="Plan ready" v={f ? timeShort(briefTime) : "—"} n={f ? `approve by ${timeShort(plusHours(briefTime, 3))}` : undefined} tone={f ? "gn" : undefined} />
        <Kpi k="Staffing" v={kitchen.length ? <>{signed(Math.round(kitchenDelta), " h")}</> : "—"} n={`${weekday(tomorrow)} kitchen`} tone={kitchenDelta <= -1 ? "am" : kitchenDelta >= 1 ? "gn" : undefined} />
      </Grid>

      <SectionHead title="Why it moved" note={f ? `${f.signals_read} signals read` : undefined} />
      <Card>
        {drivers(f).slice(0, 4).map((d, i) => (
          <Row key={i} title={d.label} note={d.source} right={<span className="text-[18px]">{d.effect}</span>} />
        ))}
        {!f ? <Row title="The evening brief runs at the configured hour." note="Set-up → Hotel to change it." /> : null}
      </Card>

      {open.length ? (
        <>
          <SectionHead title="Decisions waiting" note={<Link href="/brief" className="text-gold-light">Open the brief</Link>} />
          <Card>
            {open.slice(0, 3).map((d) => (
              <div key={d.id} className="row">
                <div className="t min-w-0">
                  <b>{typo(d.title)}</b>
                  <span>{d.detail}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {Number(d.est_saving) >= 10 ? <span className="text-[13px] text-green">{money(d.est_saving, d.currency ?? ctx.property.currency)}</span> : null}
                  {mayWrite(ctx, "decisions") ? (
                    <div className="flex items-center gap-1.5">
                      <ActionButton small variant="ghost" action={rejectDecision.bind(null, d.id)} label="Keep as is" done="Kept as is" />
                      <ActionButton small action={approveDecision.bind(null, d.id)} label="Approve" done="Approved" />
                    </div>
                  ) : (
                    <span className="pill pill-mt">{d.status}</span>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

/** "18:00" + 3 → "21:00". */
function plusHours(hhmm: string, h: number): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  return `${String(((hh ?? 0) + h) % 24).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")}`;
}
