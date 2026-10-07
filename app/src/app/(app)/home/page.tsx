import Link from "next/link";
import { DecisionRow } from "@/components/decision-row";
import { Card, Grid, Kpi, Row, ScreenHead, SectionHead } from "@/components/ui";
import { getContext } from "@/lib/data/context";
import { drivers, getDecisions, getLatestForecast, getOutlets, getPms, getStaffingWeek } from "@/lib/data/fnb";
import { greeting, plusDays, signed, timeShort, weekday, mondayOf } from "@/lib/format";

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
  // the breakfast decisions stay in their rank order whatever their status: a decided row stays where it was
  const first = decisions.find((d) => d.outlet_id === breakfast?.id) ? breakfast?.id : decisions[0]?.outlet_id;
  const primary = decisions.filter((d) => d.outlet_id === first).slice(0, 5);
  const elsewhere = open.filter((d) => d.outlet_id !== first);
  const outletName = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? (id ? "" : "hotel-wide");
  const busy = occT != null && occT >= 0.88 ? "busy " : "";

  return (
    <>
      <ScreenHead
        hi={
          <>
            {greeting(ctx.clock)}, <em>{busy}{weekday(tomorrow)}.</em>
          </>
        }
        sub={f ? `${f.covers_p50} covers forecast · ${open.length ? `${open.length} decision${open.length === 1 ? "" : "s"} waiting` : "every decision taken"}` : "No forecast yet for tomorrow"}
      />
      <Grid>
        <Kpi k="Covers forecast" v={f?.covers_p50 ?? "—"} n={f ? `range ${f.covers_p10}–${f.covers_p90}` : "runs at " + briefTime} />
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

      {primary.length ? (
        <>
          <SectionHead title={open.length ? "Decisions waiting" : "Decisions"} note={<Link href="/brief" className="text-gold-light">Open the brief</Link>} />
          <Card>
            {primary.map((d) => (
              <DecisionRow key={d.id} d={d} ctx={ctx} />
            ))}
            {elsewhere.length ? (
              <Link href="/brief" className="row text-[14px] text-gold-light">
                <span>
                  {elsewhere.length} more waiting · {[...new Set(elsewhere.map((d) => outletName(d.outlet_id)))].filter(Boolean).join(", ")}
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ) : null}
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
