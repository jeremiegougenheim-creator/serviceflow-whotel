import Link from "next/link";
import { Card, Empty, Grid, Kpi, Row, ScreenHead, Tabs } from "@/components/ui";
import { switchProperty } from "@/lib/actions/ops";
import { getContext } from "@/lib/data/context";
import { greeting, num, pct, plusDays, signed, weekday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ lens?: string; region?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const role = ctx.role;
  const lens = role === "vp" ? "ops" : role === "owner" ? "money" : sp.lens === "ops" ? "ops" : "money";
  const supabase = await createClient();
  const tomorrow = plusDays(ctx.today, 1);
  const [{ data: quarter }, { data: ops }, { data: regions }] = await Promise.all([
    supabase.rpc("sf_portfolio_quarter"),
    supabase.rpc("sf_portfolio_ops", { p_date: tomorrow }),
    supabase.from("regions").select("id, name, sort_order").order("sort_order"),
  ]);
  const q = quarter ?? [];
  const o = ops ?? [];
  const regionFilter = sp.region ?? null;
  const visibleQ = regionFilter ? q.filter((r) => r.region_id === regionFilter) : q;
  const visibleO = regionFilter ? o.filter((r) => r.region_id === regionFilter) : o;
  const totalRev = visibleQ.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalGop = visibleQ.reduce((s, r) => s + Number(r.gop ?? 0), 0);
  const totalNoi = visibleQ.reduce((s, r) => s + Number(r.noi ?? 0), 0);
  const totalAsset = visibleQ.reduce((s, r) => s + Number(r.asset_value ?? 0), 0);
  const months = 3;
  const gopMargin = totalRev ? totalGop / totalRev : null;
  const noiYield = totalAsset ? (totalNoi * 12) / months / totalAsset : null;
  const lyRev = visibleQ.reduce((s, r) => s + (r.gop_margin_ly != null ? Number(r.revenue ?? 0) : 0), 0);
  const lyMargin = lyRev ? visibleQ.reduce((s, r) => s + Number(r.gop_margin_ly ?? 0) * Number(r.revenue ?? 0), 0) / lyRev : null;
  const energy = visibleQ.filter((r) => r.energy_vs_baseline_pct != null);
  const energyAvg = energy.length ? energy.reduce((s, r) => s + Number(r.energy_vs_baseline_pct), 0) / energy.length : null;
  const keys = visibleQ.reduce((s, r) => s + (r.keys ?? 0), 0);
  const coversT = visibleO.reduce((s, r) => s + (r.covers_tomorrow ?? 0), 0);
  const shortHotels = visibleO.filter((r) => Number(r.hours_short) >= 1);
  const shortHours = shortHotels.reduce((s, r) => s + Number(r.hours_short), 0);
  const acc = visibleO.filter((r) => r.accuracy_4w != null);
  const accAvg = acc.length ? acc.reduce((s, r) => s + Number(r.accuracy_4w), 0) / acc.length : null;
  const byRegion = (regions ?? []).map((rg) => ({ ...rg, q: q.filter((r) => r.region_id === rg.id), o: o.filter((r) => r.region_id === rg.id) })).filter((rg) => rg.q.length);
  const groupLevel = role === "ceo" && !regionFilter && byRegion.length > 1;
  const quarterLabel = `${["first", "second", "third", "fourth"][Math.floor(new Date(ctx.today + "T12:00:00Z").getUTCMonth() / 3)]} quarter`;
  const regionName = regionFilter ? (regions ?? []).find((r) => r.id === regionFilter)?.name : null;
  const watch = (r: (typeof o)[number]) => (Number(r.hours_short) >= 1 ? { note: `${weekday(tomorrow)} ${String(r.short_lines ?? "kitchen").split(",")[0].toLowerCase()} short`, right: signed(-Math.round(Number(r.hours_short)), " h"), tone: "am" as const } : r.cooked_vs_plan_pct != null && Number(r.cooked_vs_plan_pct) >= 5 ? { note: "cooked above plan", right: signed(Math.round(Number(r.cooked_vs_plan_pct)), "%"), tone: "am" as const } : { note: "on plan", right: "", tone: "gn" as const });

  return (
    <>
      {lens === "money" ? (
        <ScreenHead hi={<>Quarter to date, <em>{gopMargin != null && lyMargin != null && gopMargin >= lyMargin ? (groupLevel ? "one region to watch." : "on target.") : "behind last year."}</em></>} sub={`${regionName ? regionName + " · " : ""}${groupLevel ? `${visibleQ.length} hotels` : `${num(keys)} rooms`} · ${quarterLabel}`} />
      ) : (
        <ScreenHead hi={<>{greeting(ctx.clock)}, <em>{shortHotels.length === 0 ? "all on plan." : shortHotels.length === 1 ? "one to watch." : `${["", "", "two", "three", "four", "five"][shortHotels.length] ?? shortHotels.length} to watch.`}</em></>} sub={`Tomorrow · ${num(coversT)} covers · ${visibleO.length} hotels`} />
      )}
      {role === "ceo" ? <Tabs items={[{ key: "money", label: "Money", href: `/portfolio?lens=money${regionFilter ? `&region=${regionFilter}` : ""}` }, { key: "ops", label: "Operations", href: `/portfolio?lens=ops${regionFilter ? `&region=${regionFilter}` : ""}` }]} current={lens} /> : null}
      {regionFilter ? (
        <p className="mb-3 text-[13px]">
          <Link href={`/portfolio?lens=${lens}`} className="text-gold-light">← All regions</Link>
        </p>
      ) : null}

      {lens === "money" ? (
        <>
          <Grid>
            <Kpi k="GOP margin" v={gopMargin != null ? <>{num(gopMargin * 100, 1)}<small>%</small></> : "—"} n={lyMargin != null && gopMargin != null ? `${signed(Math.round((gopMargin - lyMargin) * 1000) / 10, " pts", 1)} on last year` : undefined} />
            <Kpi k="NOI yield" v={noiYield != null ? <>{num(noiYield * 100, 1)}<small>%</small></> : "—"} n="target 6.0%" tone={noiYield != null ? (noiYield >= 0.06 ? "gn" : "am") : undefined} />
          </Grid>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">{groupLevel ? "By region" : "By hotel"}</h2>
            <span className="muted text-[12.5px]">Quarter</span>
          </div>
          <Card>
            {groupLevel
              ? byRegion.map((rg) => {
                  const rev = rg.q.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
                  const gop = rg.q.reduce((s, r) => s + Number(r.gop ?? 0), 0);
                  const noi = rg.q.reduce((s, r) => s + Number(r.noi ?? 0), 0);
                  const av = rg.q.reduce((s, r) => s + Number(r.asset_value ?? 0), 0);
                  return <Row key={rg.id} href={`/portfolio?lens=money&region=${rg.id}`} title={rg.name} note={`${rg.q.length} hotels · GOP ${rev ? num((gop / rev) * 100, 1) : "—"}% · NOI yield`} right={<span className="text-[20px]">{av ? num(((noi * 12) / months / av) * 100, 1) + "%" : "—"} ›</span>} />;
                })
              : visibleQ.map((r) => (
                  <form key={r.property_id} action={switchProperty}>
                    <input type="hidden" name="property_id" value={r.property_id ?? ""} />
                    <button type="submit" className="row w-full text-left hover:bg-navy-mid/40">
                      <div className="t min-w-0">
                        <b>{r.property}</b>
                        <span>
                          {num(r.keys ?? 0)} rooms · GOP {r.gop_margin != null ? num(Number(r.gop_margin) * 100, 1) : "—"}% · NOI yield
                        </span>
                      </div>
                      <div className="q">{r.noi_yield != null ? num(Number(r.noi_yield) * 100, 1) + "%" : "—"}</div>
                    </button>
                  </form>
                ))}
            {!visibleQ.length ? <Row title="No financials yet." note="Import monthly P&L in Set-up → Imports." /> : null}
          </Card>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">ESG report</h2>
          </div>
          <Card>
            <Row href="/waste" title="ESG report" note={energyAvg != null ? `energy ${pct(energyAvg, 0, true)} on baseline` : "energy not metered"} pill="review" tone="gd" />
          </Card>
        </>
      ) : (
        <>
          <Grid>
            <Kpi k="Forecast vs actual" v={accAvg != null ? <>±{num(accAvg, 0)}<small>%</small></> : "—"} n="covers, 4 weeks" />
            <Kpi k="Kitchen hours short" v={<>{num(Math.round(shortHours))}<small>h</small></>} n={`${shortHotels.length} hotel${shortHotels.length === 1 ? "" : "s"}, ${weekday(tomorrow)}`} tone={shortHours >= 1 ? "am" : "gn"} />
          </Grid>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">{groupLevel ? "By region" : shortHotels.length ? `${["", "One", "Two", "Three", "Four", "Five"][Math.min(5, shortHotels.length)] ?? shortHotels.length} to watch` : "Hotels"}</h2>
            <span className="muted text-[12.5px]">Tomorrow</span>
          </div>
          <Card>
            {groupLevel
              ? byRegion.map((rg) => {
                  const covers = rg.o.reduce((s, r) => s + (r.covers_tomorrow ?? 0), 0);
                  const short = rg.o.reduce((s, r) => s + Number(r.hours_short), 0);
                  const lines = [...new Set(rg.o.flatMap((r) => String(r.short_lines ?? "").split(",").map((x) => x.trim()).filter(Boolean)))];
                  return <Row key={rg.id} href={`/portfolio?lens=ops&region=${rg.id}`} title={rg.name} note={`${rg.o.length} hotels · ${num(covers)} covers · ${lines[0] ? lines[0].toLowerCase() + " short" : "on plan"}`} right={<span className="text-[20px]">{short >= 1 ? signed(-Math.round(short), " h") : "on plan"} ›</span>} />;
                })
              : [...visibleO].sort((a, b) => Number(b.hours_short) - Number(a.hours_short)).map((r) => {
                  const w = watch(r);
                  return (
                    <form key={r.property_id} action={switchProperty}>
                      <input type="hidden" name="property_id" value={r.property_id ?? ""} />
                      <button type="submit" className="row w-full text-left hover:bg-navy-mid/40">
                        <div className="t min-w-0">
                          <b>{r.property}</b>
                          <span>
                            {num(r.keys ?? 0)} keys · {w.note}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {w.right ? <div className="q">{w.right}</div> : <span className={`pill pill-${w.tone}`}>on plan</span>}
                        </div>
                      </button>
                    </form>
                  );
                })}
            {!visibleO.length ? <Empty>No hotel in scope.</Empty> : null}
          </Card>
        </>
      )}
      <p className="muted mt-4 text-[12.5px]">Tap a hotel to open its own screens. Figures in {ctx.properties[0]?.currency ?? "USD"}, converted at each hotel&rsquo;s rate.</p>
    </>
  );
}
