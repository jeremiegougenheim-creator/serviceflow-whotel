import Link from "next/link";
import { DecisionRow } from "@/components/decision-row";
import { Card, Empty, Row, ScreenHead, SectionHead, Tabs } from "@/components/ui";
import { getContext } from "@/lib/data/context";
import { drivers, getDecisions, getLatestForecast, getOutlets, inputs } from "@/lib/data/fnb";
import { money, plusDays, weekday } from "@/lib/format";

export const metadata = { title: "Brief" };

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ date?: string; outlet?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const date = sp.date ?? plusDays(ctx.today, 1);
  const outlets = await getOutlets(ctx);
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets.find((o) => o.outlet_type === "breakfast") ?? outlets[0];
  const f = outlet ? await getLatestForecast(outlet.id, date) : null;
  const decisions = outlet ? await getDecisions(ctx, date, { outletId: outlet.id, source: ["engine", "user"] }) : [];
  const total = decisions.filter((d) => d.status !== "rejected").reduce((s, d) => s + Number(d.est_saving ?? 0), 0);
  const meta = inputs(f);
  const ds = drivers(f);
  const sub = String(meta.subline ?? "");

  return (
    <>
      <ScreenHead hi={f ? <>{String(meta.headline ?? "").replace(/\.$/, "")}.</> : <>No brief yet.</>} sub={sub || `${outlet?.name ?? ""} · ${weekday(date)}`} />
      <Tabs items={outlets.map((o) => ({ key: o.slug, label: o.name, href: `/brief?outlet=${o.slug}&date=${date}` }))} current={outlet?.slug ?? ""} />

      <div className="xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start xl:gap-8">
      <div className="strike">
        <div className="eyebrow">{decisions.length === 3 ? "Three decisions" : `${decisions.length} decision${decisions.length === 1 ? "" : "s"}`} for {date === ctx.today ? "today" : weekday(date)} · {decisions.some((d) => d.status === "proposed") ? `${decisions.filter((d) => d.status === "proposed").length} waiting` : "all decided"}</div>
        <div className="tt">
          {decisions.length ? decisions.map((d) => d.kind).filter((k, i, a) => a.indexOf(k) === i).map((k) => k[0].toUpperCase() + k.slice(1)).join(", ") + "." : "Nothing to decide."}
        </div>
        {decisions.length ? (
          <div className="mt-3">
            {decisions.map((d) => (
              <DecisionRow key={d.id} d={d} ctx={ctx} />
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex items-baseline justify-between border-t border-(--sf-rule) pt-3">
          <span className="muted text-[13px]">Estimated saving</span>
          <span className="font-display text-[26px]">{money(total, ctx.property.currency)}</span>
        </div>
      </div>

      <div className="min-w-0 xl:[&>*:first-child]:!mt-0">
      <SectionHead title="Why it moved" note={f ? `${f.signals_read} signals read` : undefined} />
      {ds.length ? (
        <Card>
          {ds.map((d, i) => (
            <Row key={i} title={d.label} note={d.source} right={<span className="text-[18px]">{d.effect}</span>} />
          ))}
        </Card>
      ) : (
        <Empty>The brief is built at {String((ctx.property.settings as Record<string, string>)?.brief_time ?? "18:00")} from the PMS, the bookings and the weather.</Empty>
      )}
      {f ? (
        <p className="muted mt-4 text-[12.5px]">
          Forecast {f.covers_p10}–{f.covers_p90}, median {f.covers_p50} · habit would have planned {f.usual_covers ?? "—"} · version {f.version} ({f.kind}) · model {f.model_version} ·{" "}
          <Link href="/backtest" className="text-gold-light underline decoration-(--sf-rule-strong) underline-offset-4">
            how close it has run
          </Link>
        </p>
      ) : null}
      </div>
      </div>
    </>
  );
}
