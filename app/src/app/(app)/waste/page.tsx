import Link from "next/link";
import { CloseServiceForm } from "./close-form";
import { VoiceLogger } from "@/components/voice-logger";
import { Card, Empty, Grid, Kpi, Note, Row, ScreenHead, Tabs } from "@/components/ui";
import { getContext, mayWrite } from "@/lib/data/context";
import { getLatestForecast, getOutlets } from "@/lib/data/fnb";
import { kg as fmtKg, num, pct, plusDays, signed } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Waste" };

export default async function WastePage({ searchParams }: { searchParams: Promise<{ outlet?: string; date?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const outlets = await getOutlets(ctx);
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets.find((o) => o.outlet_type === "breakfast") ?? outlets[0];
  if (!outlet) return <Empty>No outlet configured yet.</Empty>;
  const date = sp.date ?? ctx.today;
  const supabase = await createClient();
  const [{ data: outcome }, { data: byStation }, { data: actual }, f, { data: logs }] = await Promise.all([
    supabase.from("outcomes").select("*").eq("outlet_id", outlet.id).eq("service_date", date).maybeSingle(),
    supabase.rpc("sf_waste_by_station", { p_outlet: outlet.id, p_date: date, p_weeks: 4 }),
    supabase.from("service_actuals").select("actual_covers").eq("outlet_id", outlet.id).eq("service_date", date).maybeSingle(),
    getLatestForecast(outlet.id, date),
    supabase.from("waste_logs").select("kg, co2e_kg").eq("outlet_id", outlet.id).eq("service_date", date),
  ]);
  const logged = (logs ?? []).length > 0;
  const totalKg = (logs ?? []).reduce((s, w) => s + Number(w.kg), 0);
  const totalCo2 = (logs ?? []).reduce((s, w) => s + Number(w.co2e_kg), 0);
  const covers = actual?.actual_covers ?? outcome?.actual_covers ?? null;
  const gPerCover = logged && covers ? Math.round((totalKg * 1000) / covers) : null;
  const baseline = outcome?.baseline_g_per_cover != null ? Number(outcome.baseline_g_per_cover) : Number((ctx.property.settings as Record<string, number>)?.waste_baseline_g_cover ?? 0) || null;
  // no log, no claim (rule 3): the kilos under the baseline exist only once a measured entry does;
  // a day over the baseline is shown as such, never as zero avoided
  const deltaKg = logged && baseline && covers && gPerCover != null ? ((baseline - gPerCover) * covers) / 1000 : null;
  const underKg = deltaKg != null ? Math.max(0, deltaKg) : null;
  const factor = totalKg > 0 ? totalCo2 / totalKg : Number((ctx.property.settings as Record<string, number>)?.co2e_default_factor ?? 2.5);
  const closed = !!actual;
  const err = outcome?.error_pct != null ? Number(outcome.error_pct) : f && covers ? ((covers - f.covers_p50) / f.covers_p50) * 100 : null;
  const within = outcome?.within_band ?? (f && covers ? covers >= f.covers_p10 && covers <= f.covers_p90 : null);
  const tabs = [
    { key: "live", label: "Live", href: `/live?outlet=${outlet.slug}` },
    { key: "plan", label: "Plan", href: `/plan?outlet=${outlet.slug}` },
    { key: "waste", label: "Waste log", href: `/waste?outlet=${outlet.slug}` },
  ];

  return (
    <>
      <ScreenHead
        hi={closed ? <>Service closed.</> : <>{outlet.name}, waste log.</>}
        sub={closed ? `${covers} covers${err != null ? ` · ${pct(err, 1, true)} on forecast` : ""}${within === true ? ", within the range" : within === false ? ", outside the range" : ""}` : `${date === ctx.today ? "Today" : date} · log as you go, close when the service ends`}
      />
      <Tabs items={tabs} current="waste" />
      {outlets.length > 1 ? (
        <div className="scroll-x -mx-4 mb-4 px-4">
          <div className="tabs">
            {outlets.map((o) => (
              <Link key={o.id} href={`/waste?outlet=${o.slug}&date=${date}`} className={o.id === outlet.id ? "on" : ""}>
                {o.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <Grid>
        <Kpi k="Waste logged" v={<>{num(totalKg, 1)}<small>kg</small></>} n={gPerCover != null ? `${gPerCover} g per cover` : "no cover count yet"} />
        <Kpi k={deltaKg != null && deltaKg < 0 ? "Over baseline" : "Under baseline"} v={deltaKg != null ? <>{num(Math.abs(deltaKg), 1)}<small>kg</small></> : "—"} n={deltaKg != null ? (deltaKg >= 0 ? `≈ ${num(underKg! * factor, 0)} kg CO₂e, measured by the bin` : `baseline ${baseline} g per cover`) : !logged ? "no log, no claim" : baseline ? `baseline ${baseline} g per cover` : "set a baseline in Set-up"} tone={deltaKg != null ? (deltaKg > 0 ? "gn" : deltaKg < 0 ? "am" : undefined) : undefined} />
      </Grid>

      <div className="mt-4">
        {mayWrite(ctx, "waste_logs") ? <VoiceLogger propertyId={ctx.property.id} outletId={outlet.id} serviceDate={date} department="kitchen" placeholder="Log a station, in English or Chinese" examples={["Bakery plate waste 1.5 kg", "點心 剩 一公斤"]} /> : <Note>Measured by the bin — not modelled. The kitchen logs; this view reads.</Note>}
      </div>

      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">By station</h2>
        <span className="muted text-[12.5px]">vs 4-week avg</span>
      </div>
      <Card>
        {(byStation ?? []).filter((s) => Number(s.kg) > 0 || Number(s.avg_kg) > 0).map((s) => (
          <Row key={s.station_id ?? s.station} title={s.station ?? ""} note={Number(s.avg_kg) > 0 ? `avg ${num(s.avg_kg, 1)} kg` : "no history"} right={fmtKg(s.kg)} pill={s.delta_pct == null ? "new" : signed(Number(s.delta_pct), "%")} tone={s.delta_pct == null ? "mt" : Number(s.delta_pct) <= -10 ? "gn" : Number(s.delta_pct) >= 10 ? "rd" : "mt"} />
        ))}
        {!(byStation ?? []).length ? <Row title="Nothing logged yet today." /> : null}
      </Card>

      {!closed && mayWrite(ctx, "service_actuals") ? (
        <div className="mt-6">
          <CloseServiceForm propertyId={ctx.property.id} outletId={outlet.id} serviceDate={date} suggested={f?.covers_p50 ?? null} />
        </div>
      ) : null}

      <Note>
        Measured by the log, not modelled. CO₂e uses each station&rsquo;s factor ({num(factor, 1)} kg per kg today).{" "}
        <a className="text-gold-light" href={`/api/export/esg?property=${ctx.property.id}&from=${plusDays(date, -30)}&to=${date}`}>
          Export the last 30 days (GRI 306)
        </a>
        .
      </Note>
    </>
  );
}
