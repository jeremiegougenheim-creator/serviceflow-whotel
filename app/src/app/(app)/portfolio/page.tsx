import Link from "next/link";
import type { ReactNode } from "react";
import { SortTable, sortRows, type Col } from "@/components/sort-table";
import { Card, Empty, Grid, Kpi, Row, ScreenHead, Tabs } from "@/components/ui";
import { switchProperty } from "@/lib/actions/ops";
import { getContext } from "@/lib/data/context";
import { greeting, money, num, plural, plusDays, signed, weekday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Portfolio" };

type Lens = "money" | "ops" | "rooms";
const LENS_LABEL: Record<Lens, string> = { money: "Money", ops: "Operations", rooms: "Rooms" };
/** Each portfolio role opens on its own lens and can look through the others it needs. */
const LENSES: Record<string, Lens[]> = { owner: ["money", "rooms"], vp: ["ops", "rooms"], ceo: ["money", "ops", "rooms"] };

const pctTxt = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${num(x * 100, d)}%`);
const pts = (x: number | null | undefined) => (x == null ? "—" : signed(Math.round(x * 1000) / 10, " pts", 1));

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ lens?: string; region?: string; sort?: string; dir?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const role = ctx.role;
  const lenses = LENSES[role] ?? ["money", "ops", "rooms"];
  const lens: Lens = (lenses as string[]).includes(sp.lens ?? "") ? (sp.lens as Lens) : lenses[0];
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const supabase = await createClient();
  const today = ctx.today;
  const tomorrow = plusDays(today, 1);
  const ids = ctx.properties.map((p) => p.id);
  const [{ data: quarter }, { data: ops }, { data: regions }, { data: fin }, { data: pms }] = await Promise.all([
    supabase.rpc("sf_portfolio_quarter"),
    supabase.rpc("sf_portfolio_ops", { p_date: tomorrow }),
    supabase.from("regions").select("id, name, sort_order").order("sort_order"),
    lens === "rooms"
      ? supabase.from("property_financials").select("property_id, period, revpar, occupancy, currency, fx_to_org").in("property_id", ids).lte("period", today).gte("period", plusDays(today, -400))
      : Promise.resolve({ data: [] as { property_id: string; period: string; revpar: number | null; occupancy: number | null; currency: string; fx_to_org: number }[] }),
    lens === "rooms"
      ? supabase.from("pms_daily").select("property_id, service_date, rooms_occupied, rooms_total").in("property_id", ids).gte("service_date", plusDays(today, -34)).lte("service_date", plusDays(today, 7))
      : Promise.resolve({ data: [] as { property_id: string; service_date: string; rooms_occupied: number; rooms_total: number | null }[] }),
  ]);
  const q = quarter ?? [];
  const o = ops ?? [];
  const regionFilter = sp.region ?? null;
  const inRegion = (r: { region_id: string | null }) => !regionFilter || r.region_id === regionFilter;
  const visibleQ = q.filter(inRegion);
  const visibleO = o.filter(inRegion);
  const regionName = regionFilter ? (regions ?? []).find((r) => r.id === regionFilter)?.name : null;
  const byRegion = (regions ?? []).map((rg) => ({ ...rg, q: q.filter((r) => r.region_id === rg.id), o: o.filter((r) => r.region_id === rg.id) })).filter((rg) => rg.q.length);
  const groupLevel = role === "ceo" && !regionFilter && byRegion.length > 1;
  const hotelHome = role === "owner" ? "/tonight" : role === "gm" ? "/home" : "/brief";
  const orgCurrency = q[0]?.currency ?? ctx.properties[0]?.currency ?? "USD";
  const link = (extra: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    const all = { lens, region: regionFilter, ...extra };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    return `/portfolio?${u.toString()}`;
  };

  // ── money ───────────────────────────────────────────────────────────────
  const months = 3;
  const sum = (rows: typeof visibleQ, f: (r: (typeof visibleQ)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totalRev = sum(visibleQ, (r) => Number(r.revenue ?? 0));
  const totalGop = sum(visibleQ, (r) => Number(r.gop ?? 0));
  const totalNoi = sum(visibleQ, (r) => Number(r.noi ?? 0));
  const totalAsset = sum(visibleQ, (r) => Number(r.asset_value ?? 0));
  const gopMargin = totalRev ? totalGop / totalRev : null;
  const noiYield = totalAsset ? (totalNoi * 12) / months / totalAsset : null;
  const lyRev = sum(visibleQ, (r) => (r.gop_margin_ly != null ? Number(r.revenue ?? 0) : 0));
  const lyMargin = lyRev ? sum(visibleQ, (r) => Number(r.gop_margin_ly ?? 0) * Number(r.revenue ?? 0)) / lyRev : null;
  const energy = visibleQ.filter((r) => r.energy_vs_baseline_pct != null);
  const energyAvg = energy.length ? energy.reduce((s, r) => s + Number(r.energy_vs_baseline_pct), 0) / energy.length : null;
  const keys = sum(visibleQ, (r) => r.keys ?? 0);
  const yieldTarget = Number((ctx.properties.find((p) => (p.settings as Record<string, unknown>)?.noi_yield_target)?.settings as Record<string, number> | undefined)?.noi_yield_target ?? 0.06);
  const quarterLabel = `${["first", "second", "third", "fourth"][Math.floor(new Date(today + "T12:00:00Z").getUTCMonth() / 3)]} quarter`;
  // judged on the figures as shown (one decimal): 6.0 % against a 6.0 % target is on target
  const yieldShown = noiYield != null ? Math.round(noiYield * 1000) / 1000 : null;
  const yieldOk = yieldShown != null && yieldShown >= Math.round(yieldTarget * 1000) / 1000;
  const marginUp = gopMargin != null && lyMargin != null && Math.round(gopMargin * 1000) >= Math.round(lyMargin * 1000);
  const regionsBehind = byRegion.filter((rg) => {
    const noi = rg.q.reduce((s, r) => s + Number(r.noi ?? 0), 0);
    const av = rg.q.reduce((s, r) => s + Number(r.asset_value ?? 0), 0);
    return av > 0 && Math.round(((noi * 12) / months / av) * 1000) < Math.round(yieldTarget * 1000);
  }).length;
  const moneyHeadline = groupLevel
    ? regionsBehind === 0 ? "every region on target." : regionsBehind === 1 ? "one region to watch." : `${regionsBehind} regions to watch.`
    : marginUp && yieldOk ? "on target." : marginUp ? "margin up, yield under target." : yieldOk ? "yield on target, margin behind last year." : "behind last year.";

  // ── operations ──────────────────────────────────────────────────────────
  const coversT = visibleO.reduce((s, r) => s + (r.covers_tomorrow ?? 0), 0);
  const shortHotels = visibleO.filter((r) => Number(r.hours_short) >= 1);
  const shortHours = shortHotels.reduce((s, r) => s + Number(r.hours_short), 0);
  const acc = visibleO.filter((r) => r.mape_4w_pct != null);
  const accAvg = acc.length ? acc.reduce((s, r) => s + Number(r.mape_4w_pct), 0) / acc.length : null;
  const watch = (r: (typeof o)[number]) => {
    const lines = String(r.short_lines ?? "").split(" · ").map((x) => x.trim()).filter(Boolean);
    if (Number(r.hours_short) >= 1) return { note: `${weekday(tomorrow)} · ${lines.length ? lines.slice(0, 2).join(" · ").toLowerCase() : "kitchen short"}`, right: signed(-Math.round(Number(r.hours_short)), " h"), tone: "am" as const };
    if (r.off_plan_pct != null && Number(r.off_plan_pct) >= 5) return { note: "prepped off the confirmed plan, 4 weeks", right: signed(Math.round(Number(r.off_plan_pct)), "%"), tone: "am" as const };
    if (r.off_plan_pct == null && r.mape_4w_pct != null) return { note: "hours on demand · plan not confirmed in the app", right: "", tone: "mt" as const };
    return { note: "hours on demand · on plan", right: "", tone: "gn" as const };
  };

  // ── rooms ───────────────────────────────────────────────────────────────
  // pms_daily for a date is the house the night before: last 7 nights = the 7 dates up to today,
  // next 7 nights on the books = the 7 dates after today
  const keysOf = new Map(ctx.properties.map((p) => [p.id, p.keys]));
  const occ = (pid: string | null, from: string, to: string) => {
    const rows = (pms ?? []).filter((r) => (!pid || r.property_id === pid) && r.service_date >= from && r.service_date <= to && (!pid ? visibleQ.some((v) => v.property_id === r.property_id) : true));
    const occd = rows.reduce((s, r) => s + r.rooms_occupied, 0);
    const avail = rows.reduce((s, r) => s + (r.rooms_total ?? keysOf.get(r.property_id) ?? 0), 0);
    return rows.length >= 4 && avail ? occd / avail : null;
  };
  const W = { last: [plusDays(today, -6), today], before: [plusDays(today, -34), plusDays(today, -28)], next: [plusDays(today, 1), plusDays(today, 7)] } as const;
  const monthOf = (d: string) => d.slice(0, 7);
  const latestFin = (pid: string) => (fin ?? []).filter((f) => f.property_id === pid && f.revpar != null).sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
  const rooms = visibleQ.map((r) => {
    const pid = r.property_id!;
    const f = latestFin(pid);
    const ly = f ? (fin ?? []).find((x) => x.property_id === pid && monthOf(x.period) === `${Number(f.period.slice(0, 4)) - 1}${f.period.slice(4, 7)}` && x.revpar != null) : null;
    const last = occ(pid, ...W.last);
    const before = occ(pid, ...W.before);
    return {
      id: pid,
      name: r.property ?? "",
      region: r.region ?? "",
      keys: r.keys ?? 0,
      last,
      trend: last != null && before != null ? last - before : null,
      next: occ(pid, ...W.next),
      revpar: f ? Number(f.revpar) : null,
      revparOrg: f ? Number(f.revpar) * Number(f.fx_to_org ?? 1) : null,
      adr: f && Number(f.occupancy) > 0 ? Number(f.revpar) / Number(f.occupancy) : null,
      revparLy: ly ? Number(ly.revpar) : null,
      currency: f?.currency ?? orgCurrency,
      month: f?.period ?? null,
    };
  });
  type RoomRow = (typeof rooms)[number];
  const pLast = occ(null, ...W.last);
  const pBefore = occ(null, ...W.before);
  const pNext = occ(null, ...W.next);
  const withRevpar = rooms.filter((r) => r.revparOrg != null);
  const revparKeys = withRevpar.reduce((s, r) => s + r.keys, 0);
  const pRevpar = revparKeys ? withRevpar.reduce((s, r) => s + r.revparOrg! * r.keys, 0) / revparKeys : null;
  const pOccMonth = revparKeys ? withRevpar.reduce((s, r) => s + (r.revpar && r.adr ? (r.revpar / r.adr) * r.keys : 0), 0) / revparKeys : null;
  const pAdr = pRevpar != null && pOccMonth ? pRevpar / pOccMonth : null;
  const monthName = withRevpar[0]?.month ? new Date(withRevpar[0].month + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }) : "this month";
  const roomsHeadline = pNext == null ? "rooms not imported yet." : pLast != null && pNext >= pLast + 0.02 ? "busier ahead." : pLast != null && pNext <= pLast - 0.02 ? "softer ahead." : "steady.";

  // ── desktop tables ──────────────────────────────────────────────────────
  const hotelCell = (id: string, name: string, sub?: ReactNode) => (
    <form action={switchProperty}>
      <input type="hidden" name="property_id" value={id} />
      <input type="hidden" name="next" value={hotelHome} />
      <button type="submit" className="text-left">
        <b className="font-medium text-cream hover:text-gold-light">{name}</b>
        {sub ? <span className="block text-[12.5px] text-mist">{sub}</span> : null}
      </button>
    </form>
  );
  type QRow = (typeof visibleQ)[number];
  type ORow = (typeof visibleO)[number];
  const moneyCols: Col<QRow>[] = [
    { key: "hotel", label: "Hotel", sort: (r) => r.property, cell: (r) => hotelCell(r.property_id!, r.property ?? "", r.region) },
    { key: "keys", label: "Rooms", num: true, sort: (r) => r.keys, cell: (r) => num(r.keys ?? 0) },
    { key: "gop", label: "GOP margin", num: true, sort: (r) => (r.gop_margin == null ? null : Number(r.gop_margin)), cell: (r) => pctTxt(r.gop_margin == null ? null : Number(r.gop_margin)) },
    { key: "ly", label: "On last year", num: true, sort: (r) => (r.gop_margin == null || r.gop_margin_ly == null ? null : Number(r.gop_margin) - Number(r.gop_margin_ly)), cell: (r) => (r.gop_margin == null || r.gop_margin_ly == null ? "—" : pts(Number(r.gop_margin) - Number(r.gop_margin_ly))) },
    { key: "yield", label: "NOI yield", hint: `target ${num(yieldTarget * 100, 1)}%`, num: true, sort: (r) => (r.noi_yield == null ? null : Number(r.noi_yield)), cell: (r) => <span className={r.noi_yield == null ? "" : Math.round(Number(r.noi_yield) * 1000) >= Math.round(yieldTarget * 1000) ? "text-green" : "text-amber"}>{pctTxt(r.noi_yield == null ? null : Number(r.noi_yield))}</span> },
    { key: "energy", label: "Energy", hint: "against baseline", num: true, sort: (r) => (r.energy_vs_baseline_pct == null ? null : Number(r.energy_vs_baseline_pct)), cell: (r) => (r.energy_vs_baseline_pct == null ? "not metered" : signed(Math.round(Number(r.energy_vs_baseline_pct)), "%")) },
  ];
  const opsCols: Col<ORow>[] = [
    { key: "hotel", label: "Hotel", sort: (r) => r.property, cell: (r) => hotelCell(r.property_id!, r.property ?? "", r.region) },
    { key: "covers", label: "Covers", hint: weekday(tomorrow), num: true, sort: (r) => r.covers_tomorrow, cell: (r) => num(r.covers_tomorrow ?? 0) },
    { key: "short", label: "Kitchen hours", hint: "against demand", num: true, sort: (r) => Number(r.hours_short), cell: (r) => (Number(r.hours_short) >= 1 ? <span className="text-amber">{signed(-Math.round(Number(r.hours_short)), " h")}</span> : <span className="text-green">on demand</span>) },
    { key: "lines", label: "Short on", cell: (r) => <span className="text-[13px] text-mist">{String(r.short_lines ?? "").split(" · ").filter(Boolean).slice(0, 2).join(" · ") || "—"}</span> },
    { key: "acc", label: "Forecast miss", hint: "4 weeks", num: true, sort: (r) => (r.mape_4w_pct == null ? null : Number(r.mape_4w_pct)), cell: (r) => (r.mape_4w_pct == null ? "—" : `±${num(Number(r.mape_4w_pct), 0)}%`) },
    { key: "offplan", label: "Off plan", hint: "4 weeks", num: true, sort: (r) => (r.off_plan_pct == null ? null : Number(r.off_plan_pct)), cell: (r) => (r.off_plan_pct == null ? <span className="text-mist">not confirmed</span> : <span className={Number(r.off_plan_pct) >= 5 ? "text-amber" : ""}>{num(Number(r.off_plan_pct), 0)}%</span>) },
  ];
  const roomCols: Col<RoomRow>[] = [
    { key: "hotel", label: "Hotel", sort: (r) => r.name, cell: (r) => hotelCell(r.id, r.name, r.region) },
    { key: "keys", label: "Rooms", num: true, sort: (r) => r.keys, cell: (r) => num(r.keys) },
    { key: "last", label: "Occupancy", hint: "last 7 nights", num: true, sort: (r) => r.last, cell: (r) => pctTxt(r.last, 0) },
    { key: "trend", label: "Trend", hint: "on 4 weeks before", num: true, sort: (r) => r.trend, cell: (r) => <span className={r.trend == null ? "" : r.trend <= -0.02 ? "text-amber" : r.trend >= 0.02 ? "text-green" : ""}>{pts(r.trend)}</span> },
    { key: "next", label: "On the books", hint: "next 7 nights", num: true, sort: (r) => r.next, cell: (r) => pctTxt(r.next, 0) },
    { key: "adr", label: "ADR", hint: monthName, num: true, sort: (r) => r.adr, cell: (r) => money(r.adr, r.currency) },
    { key: "revpar", label: "RevPAR", hint: monthName, num: true, sort: (r) => r.revparOrg, cell: (r) => (
        <>
          {money(r.revpar, r.currency)}
          {r.revparLy ? <span className="block text-[12px] text-mist">{signed(Math.round(((r.revpar! - r.revparLy) / r.revparLy) * 1000) / 10, "%", 1)} on last year</span> : null}
        </>
      ) },
  ];
  const defaultSort: Record<Lens, { key: string; dir: "asc" | "desc" }> = { money: { key: "yield", dir: "asc" }, ops: { key: "short", dir: "desc" }, rooms: { key: "next", dir: "desc" } };
  const sortKey = sp.sort ?? defaultSort[lens].key;
  const sortDir = sp.sort ? dir : defaultSort[lens].dir;
  const tableHref = (key: string, d: "asc" | "desc") => link({ sort: key, dir: d });

  return (
    <>
      {lens === "money" ? (
        <ScreenHead hi={<>Quarter to date, <em>{moneyHeadline}</em></>} sub={`${regionName ? regionName + " · " : ""}${groupLevel ? plural(visibleQ.length, "hotel") : `${num(keys)} rooms`} · ${quarterLabel}`} />
      ) : lens === "ops" ? (
        <ScreenHead hi={<>{greeting(ctx.clock)}, <em>{shortHotels.length === 0 ? "all on plan." : shortHotels.length === 1 ? "one to watch." : `${["", "", "two", "three", "four", "five"][shortHotels.length] ?? shortHotels.length} to watch.`}</em></>} sub={`Tomorrow · ${num(coversT)} covers · ${plural(visibleO.length, "hotel")}`} />
      ) : (
        <ScreenHead hi={<>Next seven nights, <em>{roomsHeadline}</em></>} sub={`${regionName ? regionName + " · " : ""}${pNext != null ? `${pctTxt(pNext, 0)} on the books` : "no rooms on the books"} · ${num(keys)} rooms · ${plural(visibleQ.length, "hotel")}`} />
      )}
      {lenses.length > 1 ? <Tabs items={lenses.map((l) => ({ key: l, label: LENS_LABEL[l], href: `/portfolio?lens=${l}${regionFilter ? `&region=${regionFilter}` : ""}` }))} current={lens} /> : null}
      {regionFilter ? (
        <p className="mb-3 text-[13px]">
          <Link href={`/portfolio?lens=${lens}`} className="text-gold-light">
            ← All regions
          </Link>
        </p>
      ) : null}

      {lens === "money" ? (
        <>
          <Grid cols={4}>
            <Kpi k="GOP margin" v={gopMargin != null ? <>{num(gopMargin * 100, 1)}<small>%</small></> : "—"} n={lyMargin != null && gopMargin != null ? `${pts(gopMargin - lyMargin)} on last year` : undefined} />
            <Kpi k="NOI yield" v={noiYield != null ? <>{num(noiYield * 100, 1)}<small>%</small></> : "—"} n={`target ${num(yieldTarget * 100, 1)}%`} tone={yieldShown != null ? (yieldOk ? "gn" : "am") : undefined} />
            <Kpi k="Energy" v={energyAvg != null ? <>{signed(Math.round(energyAvg), "")}<small>%</small></> : "—"} n={energyAvg != null ? "against baseline, metered" : "not metered"} tone={energyAvg != null && energyAvg <= 0 ? "gn" : undefined} />
            <Kpi k="Hotels" v={num(visibleQ.length)} n={`${num(keys)} rooms`} />
          </Grid>
          <ListHead title={groupLevel ? "By region" : "By hotel"} note="Quarter" />
          {groupLevel ? (
            <>
            <Card>
              {byRegion.map((rg) => {
                const rev = rg.q.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
                const gop = rg.q.reduce((s, r) => s + Number(r.gop ?? 0), 0);
                const noi = rg.q.reduce((s, r) => s + Number(r.noi ?? 0), 0);
                const av = rg.q.reduce((s, r) => s + Number(r.asset_value ?? 0), 0);
                return <Row key={rg.id} href={`/portfolio?lens=money&region=${rg.id}`} title={rg.name} note={`${rg.q.length} hotels · GOP ${rev ? num((gop / rev) * 100, 1) : "—"}% · NOI yield`} right={<span className="text-[20px]">{av ? num(((noi * 12) / months / av) * 100, 1) + "%" : "—"} ›</span>} />;
              })}
            </Card>
            <AllHotels>
              <SortTable caption="Every hotel by quarter figures" rows={sortRows(visibleQ, moneyCols, sortKey, sortDir)} cols={moneyCols} sort={sortKey} dir={sortDir} href={tableHref} rowKey={(r) => r.property_id!} />
            </AllHotels>
            </>
          ) : (
            <>
              <div className="hidden lg:block">
                <SortTable caption="Hotels by quarter figures" rows={sortRows(visibleQ, moneyCols, sortKey, sortDir)} cols={moneyCols} sort={sortKey} dir={sortDir} href={tableHref} rowKey={(r) => r.property_id!} />
              </div>
              <Card className="lg:hidden">
                {sortRows(visibleQ, moneyCols, sortKey, sortDir).map((r) => (
                  <HotelRow key={r.property_id} id={r.property_id!} next={hotelHome} title={r.property ?? ""} note={`${num(r.keys ?? 0)} rooms · GOP ${r.gop_margin != null ? num(Number(r.gop_margin) * 100, 1) : "—"}% · NOI yield`} right={r.noi_yield != null ? num(Number(r.noi_yield) * 100, 1) + "%" : "—"} />
                ))}
              </Card>
            </>
          )}
          {!visibleQ.length ? <Empty>No financials yet. Import monthly P&amp;L in Set-up → Imports.</Empty> : null}
          <ListHead title="ESG" note="Measured, not modelled" />
          <Card>
            <Row href="/waste" title="Waste, CO₂e and energy report" note={energyAvg != null ? `energy ${num(Math.abs(energyAvg), 0)}% ${energyAvg <= 0 ? "under" : "over"} baseline across the portfolio` : "energy not metered"} pill="open" tone="gd" />
          </Card>
        </>
      ) : lens === "ops" ? (
        <>
          <Grid cols={4}>
            <Kpi k="Forecast miss" v={accAvg != null ? <>±{num(accAvg, 0)}<small>%</small></> : "—"} n="covers, 4 weeks" />
            <Kpi k="Kitchen hours short" v={<>{num(Math.round(shortHours))}<small>h</small></>} n={`${plural(shortHotels.length, "hotel")} · ${weekday(tomorrow)}`} tone={shortHours >= 1 ? "am" : "gn"} />
            <Kpi k="Covers" v={num(coversT)} n={weekday(tomorrow)} />
            <Kpi k="Hotels" v={num(visibleO.length)} n={shortHotels.length ? `${shortHotels.length} short tomorrow` : "all on demand"} />
          </Grid>
          <ListHead title={groupLevel ? "By region" : shortHotels.length ? `${["", "One", "Two", "Three", "Four", "Five"][Math.min(5, shortHotels.length)] ?? shortHotels.length} to watch` : "Hotels"} note="Tomorrow" />
          {groupLevel ? (
            <>
            <Card>
              {byRegion.map((rg) => {
                const covers = rg.o.reduce((s, r) => s + (r.covers_tomorrow ?? 0), 0);
                const short = rg.o.reduce((s, r) => s + Number(r.hours_short), 0);
                const lines = [...new Set(rg.o.flatMap((r) => String(r.short_lines ?? "").split(" · ").map((x) => x.trim()).filter(Boolean)))];
                return <Row key={rg.id} href={`/portfolio?lens=ops&region=${rg.id}`} title={rg.name} note={`${rg.o.length} hotels · ${num(covers)} covers · ${lines[0] ? lines[0].toLowerCase() + " short" : "on plan"}`} right={<span className="text-[20px]">{short >= 1 ? signed(-Math.round(short), " h") : "on plan"} ›</span>} />;
              })}
            </Card>
            <AllHotels>
              <SortTable caption="Every hotel by tomorrow's operations" rows={sortRows(visibleO, opsCols, sortKey, sortDir)} cols={opsCols} sort={sortKey} dir={sortDir} href={tableHref} rowKey={(r) => r.property_id!} />
            </AllHotels>
            </>
          ) : (
            <>
              <div className="hidden lg:block">
                <SortTable caption="Hotels by tomorrow's operations" rows={sortRows(visibleO, opsCols, sortKey, sortDir)} cols={opsCols} sort={sortKey} dir={sortDir} href={tableHref} rowKey={(r) => r.property_id!} />
              </div>
              <Card className="lg:hidden">
                {sortRows(visibleO, opsCols, sortKey, sortDir).map((r) => {
                  const w = watch(r);
                  return <HotelRow key={r.property_id} id={r.property_id!} next={hotelHome} title={r.property ?? ""} note={`${num(r.keys ?? 0)} keys · ${w.note}`} right={w.right || undefined} pill={w.right ? undefined : { text: w.tone === "gn" ? "on plan" : "no plan data", tone: w.tone }} />;
                })}
              </Card>
            </>
          )}
          {!visibleO.length ? <Empty>No hotel in scope.</Empty> : null}
        </>
      ) : (
        <>
          <Grid cols={4}>
            <Kpi k="Occupancy" v={pctTxt(pLast, 0)} n={pLast != null && pBefore != null ? `last 7 nights · ${pts(pLast - pBefore)} on 4 weeks before` : "last 7 nights"} tone={pLast != null && pBefore != null && pLast - pBefore <= -0.02 ? "am" : undefined} />
            <Kpi k="On the books" v={pctTxt(pNext, 0)} n="next 7 nights" />
            <Kpi k="RevPAR" v={money(pRevpar, orgCurrency)} n={`${monthName} · ${orgCurrency}`} />
            <Kpi k="ADR" v={money(pAdr, orgCurrency)} n={`${monthName} · ${orgCurrency}`} />
          </Grid>
          <ListHead title={groupLevel ? "By region" : "By hotel"} note="Nights from the PMS · RevPAR from the P&L" />
          {groupLevel ? (
            <>
            <Card>
              {byRegion.map((rg) => {
                const ids2 = new Set(rg.q.map((r) => r.property_id));
                const rr = rooms.filter((r) => ids2.has(r.id));
                const k = rr.reduce((s, r) => s + r.keys, 0);
                const nx = k ? rr.reduce((s, r) => s + (r.next ?? 0) * r.keys, 0) / k : null;
                const ls = k ? rr.reduce((s, r) => s + (r.last ?? 0) * r.keys, 0) / k : null;
                return <Row key={rg.id} href={`/portfolio?lens=rooms&region=${rg.id}`} title={rg.name} note={`${rg.q.length} hotels · last 7 nights ${pctTxt(ls, 0)} · on the books`} right={<span className="text-[20px]">{pctTxt(nx, 0)} ›</span>} />;
              })}
            </Card>
            <AllHotels>
              <SortTable caption="Every hotel by rooms" rows={sortRows(rooms, roomCols, sortKey, sortDir)} cols={roomCols} sort={sortKey} dir={sortDir} href={tableHref} rowKey={(r) => r.id} />
            </AllHotels>
            </>
          ) : (
            <>
              <div className="hidden lg:block">
                <SortTable caption="Hotels by rooms" rows={sortRows(rooms, roomCols, sortKey, sortDir)} cols={roomCols} sort={sortKey} dir={sortDir} href={tableHref} rowKey={(r) => r.id} />
              </div>
              <Card className="lg:hidden">
                {sortRows(rooms, roomCols, sortKey, sortDir).map((r) => (
                  <HotelRow key={r.id} id={r.id} next={hotelHome} title={r.name} note={`last 7 nights ${pctTxt(r.last, 0)}${r.trend != null ? ` (${pts(r.trend)})` : ""} · ADR ${money(r.adr, r.currency)} · RevPAR ${money(r.revpar, r.currency)} · on the books`} right={pctTxt(r.next, 0)} />
                ))}
              </Card>
            </>
          )}
        </>
      )}
      <p className="muted mt-4 text-[12.5px]">
        {groupLevel ? <>Tap a region to see its hotels<span className="hidden lg:inline">, or a hotel to open its own screens</span>.</> : "Tap a hotel to open its own screens."}
        {lens === "money"
          ? ` Figures in ${orgCurrency}, converted at each hotel’s rate.`
          : lens === "ops"
            ? " Hours are tomorrow’s kitchen lines against the covers forecast."
            : ` Occupancy and the books come from each hotel's PMS feed; RevPAR and ADR from its monthly P&L, in the hotel's currency (portfolio figures in ${orgCurrency}). The rooms on the books are what drives tomorrow's covers forecast.`}
      </p>
    </>
  );
}

/** On a desktop, the group view lists every hotel under the regions, sortable. */
function AllHotels({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden lg:block">
      <ListHead title="Every hotel" note="Click a header to sort" />
      {children}
    </div>
  );
}

function ListHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-1 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="text-[20px]">{title}</h2>
      {note ? <span className="muted text-right text-[12.5px]">{note}</span> : null}
    </div>
  );
}

/** A hotel in a phone list: the whole row opens the hotel's own screens. */
function HotelRow({ id, next, title, note, right, pill }: { id: string; next: string; title: string; note: string; right?: string; pill?: { text: string; tone: string } }) {
  return (
    <form action={switchProperty}>
      <input type="hidden" name="property_id" value={id} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="row w-full text-left hover:bg-navy-mid/40">
        <div className="t min-w-0">
          <b>{title}</b>
          <span>{note}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {right ? (
            <div className="q">
              {right} <span className="text-[20px] text-mist" aria-hidden="true">›</span>
            </div>
          ) : pill ? (
            <span className={`pill pill-${pill.tone}`}>{pill.text} ›</span>
          ) : null}
        </div>
      </button>
    </form>
  );
}
