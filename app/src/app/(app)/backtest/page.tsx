import Link from "next/link";
import { redirect } from "next/navigation";
import { BacktestChart } from "@/components/backtest-chart";
import {
  Card,
  Empty,
  Kpi,
  Note,
  Row,
  ScreenHead,
  SectionHead,
  Tabs,
} from "@/components/ui";
import { backtestProperty } from "@/lib/data/backtest";
import { getContext } from "@/lib/data/context";
import type {
  Accuracy,
  ReplayPoint,
  ReplaySummary,
} from "@/lib/engine/backtest";
import { MODEL_VERSION } from "@/lib/engine/version";
import { dayLabel, mondayOf, plusDays } from "@/lib/format";
import { BACKTEST_ROLES, homeFor, NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Backtest" };

const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const lean = (b: number) =>
  Math.abs(b) < 0.01
    ? "No lean"
    : b > 0
      ? `Under by ${p1(b)}`
      : `Over by ${p1(-b)}`;

/** One sentence that says what the numbers mean, whichever way they fall. */
function verdict(s: ReplaySummary): string {
  const gap = (a: number, b: number) =>
    a < b - 0.002 ? "closer" : a > b + 0.002 ? "further" : "level";
  const vsHabit = gap(s.engine.mape, s.habit.mape);
  const vsSimple = s.simple
    ? gap(s.simple.engine.mape, s.simple.baseline.mape)
    : null;
  const habitWords =
    vsHabit === "closer"
      ? "closer than habit"
      : vsHabit === "level"
        ? "level with habit"
        : "further off than habit";
  if (!vsSimple) return `ServiceFlow ran ${habitWords}.`;
  if (vsSimple === "closer")
    return `ServiceFlow ran ${habitWords} and closer than the ${s.simpleLabel.toLowerCase()}.`;
  if (vsSimple === "level")
    return `ServiceFlow ran ${habitWords}, and level with the ${s.simpleLabel.toLowerCase()}: on this history the segments add little to the covers number.`;
  return `ServiceFlow ran ${habitWords}, but further off than the ${s.simpleLabel.toLowerCase()}: on this history the segments are not earning their keep.`;
}

function bandWords(w: number): string {
  if (w < 0.7) return "range too narrow";
  if (w > 0.92) return "range wider than needed";
  return "aim about 80%";
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const ctx = await getContext();
  if (!BACKTEST_ROLES.includes(ctx.role)) redirect(homeFor(ctx.role));
  const sp = await searchParams;
  const supabase = await createClient();
  const to = plusDays(ctx.today, -1);
  const [results, { data: live }] = await Promise.all([
    backtestProperty(supabase, ctx.property.id, to),
    supabase
      .from("outcomes")
      .select("outlet_id, service_date, mape, within_band")
      .eq("property_id", ctx.property.id)
      .not("forecast_id", "is", null)
      .not("mape", "is", null)
      .gte("service_date", plusDays(to, -89))
      .lte("service_date", ctx.today),
  ]);
  const scored = results.filter((r) => r.summary);
  const current = scored.find((r) => r.outlet.slug === sp.outlet) ?? scored[0];
  const illustrative =
    (ctx.property.settings as { illustrative?: boolean } | null)
      ?.illustrative === true;

  if (!current?.summary) {
    return (
      <>
        <ScreenHead
          eyebrow={`Backtest · ${ctx.property.name}`}
          hi={
            <>
              Not enough history <em>yet.</em>
            </>
          }
          sub="The replay needs the PMS days and the closed covers of at least 14 services, plus two of each weekday."
        />
        <Empty>
          Import past PMS days and covers in Set-up → Imports, then come back.
        </Empty>
      </>
    );
  }
  const s = current.summary;
  const points = current.points;
  const recent = points.slice(-35);
  // week by week, Monday to Sunday: does the forecast hold, or did one good week carry it?
  const byWeek = new Map<string, ReplayPoint[]>();
  for (const pt of points) {
    const m = mondayOf(pt.date);
    byWeek.set(m, [...(byWeek.get(m) ?? []), pt]);
  }
  const ape = (pt: ReplayPoint, f: number) =>
    Math.abs(pt.actual - f) / Math.max(1, pt.actual);
  const weeks = [...byWeek.entries()]
    .filter(([, ps]) => ps.length >= 4)
    .map(([from, ps]) => ({
      from,
      n: ps.length,
      engine: ps.reduce((a, x) => a + ape(x, x.p50), 0) / ps.length,
      habit: ps.reduce((a, x) => a + ape(x, x.habit), 0) / ps.length,
    }))
    .reverse();
  const maxWeek = Math.max(0.01, ...weeks.flatMap((w) => [w.engine, w.habit]));
  const liveRows = (live ?? []).filter(
    (r) => r.outlet_id === current.outlet.id,
  );
  const liveMape = liveRows.length
    ? liveRows.reduce((a, r) => a + Number(r.mape), 0) / liveRows.length
    : null;
  const liveBand = liveRows.length
    ? liveRows.filter((r) => r.within_band).length / liveRows.length
    : null;

  const compare: {
    name: string;
    note: string;
    a: Accuracy;
    closer?: string;
  }[] = [
    { name: "ServiceFlow", note: `model ${MODEL_VERSION}`, a: s.engine },
    {
      name: "Habit",
      note: "same weekday, last four weeks",
      a: s.habit,
      closer: `ServiceFlow closer on ${s.closerThanHabit} of ${s.n} days${s.sameAsHabit ? `, level on ${s.sameAsHabit}` : ""}`,
    },
  ];

  return (
    <>
      <ScreenHead
        eyebrow={`Backtest · ${ctx.property.name}`}
        hi={
          <>
            {current.outlet.name}: <em>{p1(s.engine.mape)}</em> average miss.
          </>
        }
        sub={`${s.n} services replayed, ${dayLabel(s.from, "short")} to ${dayLabel(s.to, "short")}, each with only what was known the evening before. ${verdict(s)}`}
      />

      {illustrative ? (
        <div
          className="card mb-4 border-amber/40 px-4 py-3 text-[13.5px] leading-relaxed"
          role="note"
        >
          <b className="text-amber">Illustrative history.</b>{" "}
          <span className="muted">
            These past services were generated for the demo, so this run shows
            how the test reads, not how accurate ServiceFlow is. On a
            hotel&apos;s own 90 days, the same test gives the real figure.
          </span>
        </div>
      ) : null}

      {scored.length > 1 ? (
        <Tabs
          current={current.outlet.slug}
          items={scored.map((r) => ({
            key: r.outlet.slug,
            label: r.outlet.name,
            href: `/backtest?outlet=${r.outlet.slug}`,
          }))}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi
          k="Average miss"
          v={p1(s.engine.mape)}
          n={`habit ${p1(s.habit.mape)}`}
          tone={
            s.engine.mape < s.habit.mape - 0.002
              ? "gn"
              : s.engine.mape > s.habit.mape + 0.002
                ? "am"
                : undefined
          }
        />
        <Kpi
          k="Covers off a day"
          v={s.engine.mae.toFixed(1)}
          n={`habit ${s.habit.mae.toFixed(1)}`}
        />
        <Kpi
          k="Lean"
          v={
            Math.abs(s.engine.bias) < 0.01
              ? "None"
              : p1(Math.abs(s.engine.bias))
          }
          n={
            Math.abs(s.engine.bias) < 0.01
              ? "under 1% either way"
              : s.engine.bias > 0
                ? "forecast under the actual"
                : "forecast over the actual"
          }
          tone={Math.abs(s.engine.bias) >= 0.03 ? "am" : undefined}
        />
        <Kpi
          k="Inside the range"
          v={`${Math.round(s.withinBand * 100)}%`}
          n={bandWords(s.withinBand)}
          tone={s.withinBand < 0.7 ? "am" : undefined}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <SectionHead title="Day by day" note="last five weeks" />
          <BacktestChart
            points={recent}
            label={`Actual covers against the ServiceFlow forecast, its range and habit, ${current.outlet.name}, ${dayLabel(recent[0].date, "short")} to ${dayLabel(s.to, "short")}.`}
          />

          <SectionHead title="Against what the hotel uses today" />
          <Card>
            {compare.map((c) => (
              <Row
                key={c.name}
                title={
                  <span
                    className={
                      c.name === "ServiceFlow" ? "text-gold-light" : ""
                    }
                  >
                    {c.name}
                  </span>
                }
                note={`${c.closer ?? c.note} · ${c.a.mae.toFixed(1)} covers off a day · ${lean(c.a.bias).toLowerCase()}`}
                right={p1(c.a.mape)}
              />
            ))}
            {s.simple ? (
              <Row
                title={s.simpleLabel}
                note={`ServiceFlow ${p1(s.simple.engine.mape)} on the same ${s.simple.n} days, closer on ${s.closerThanSimple} · ${s.simple.baseline.mae.toFixed(1)} covers off a day · ${lean(s.simple.baseline.bias).toLowerCase()}`}
                right={p1(s.simple.baseline.mape)}
              />
            ) : null}
          </Card>
          <p className="muted mt-2 text-[12.5px]">
            Average miss is the mean absolute percentage error (MAPE). Lean is
            the mean signed error: under means the service ran above the
            forecast.
          </p>

          <SectionHead title="Where it missed most" />
          <Card>
            {s.worst.map((p) => (
              <MissRow key={p.date} p={p} />
            ))}
          </Card>
        </div>
        <div className="min-w-0">
          <SectionHead title="Week by week" note="average miss" />
          <Card>
            {weeks.map((w) => (
              <div key={w.from} className="row !items-center">
                <div className="t min-w-0">
                  <b>
                    Week of {dayLabel(w.from, "short").replace(/^\w+ /, "")}
                  </b>
                  <span>{w.n} services</span>
                </div>
                <div
                  className="w-[46%] shrink-0 space-y-1.5"
                  aria-label={`ServiceFlow ${p1(w.engine)}, habit ${p1(w.habit)}`}
                >
                  <Bar v={w.engine} max={maxWeek} label={p1(w.engine)} gold />
                  <Bar v={w.habit} max={maxWeek} label={p1(w.habit)} />
                </div>
              </div>
            ))}
          </Card>
          <p className="muted mt-2 flex gap-4 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-1.5 w-4 rounded-full bg-gold-light" />{" "}
              ServiceFlow
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-1.5 w-4 rounded-full bg-mist/60" />{" "}
              Habit
            </span>
          </p>

          <SectionHead title="Issued forecasts" note="scored each night" />
          <Card>
            {liveMape != null && liveRows.length >= 7 ? (
              <Row
                title={`${p1(liveMape)} average miss over the last ${liveRows.length} services`}
                note={`${Math.round((liveBand ?? 0) * 100)}% inside the range. This is the forecast as it was sent, not a replay.`}
              />
            ) : (
              <Row
                title="The live record starts after seven scored services"
                note={`${liveRows.length ? `${liveRows.length} scored so far. ` : ""}Each night the debrief scores the forecast that was sent against the covers served, and the record builds here.`}
              />
            )}
          </Card>

          <details className="card mt-6 px-4 py-3 text-[13.5px] leading-relaxed">
            <summary className="cursor-pointer py-1 font-medium">
              How the test runs
            </summary>
            <ul className="muted mt-2 list-disc space-y-1.5 pl-5">
              <li>
                Every evening is replayed with only what was known before it:
                the forecast for a day never sees that day&apos;s covers, or
                anything after.
              </li>
              <li>
                The first {s.warmup} services only build history and are not
                scored. Days without a PMS row or closed covers are skipped.
              </li>
              <li>
                Nothing is fitted to these days. Attach rates and the rest come
                from Set-up; the calibration uses earlier services only, as it
                does live.
              </li>
              <li>
                Past days carry the room counts the PMS finally recorded. The
                evening before, the forecast reads the rooms on the books, so
                live accuracy runs a little below the replay. The
                issued-forecast record above is the live figure.
              </li>
              <li>
                Habit is what a kitchen plans on by default. The{" "}
                {s.simpleLabel.toLowerCase()} is the spreadsheet most hotels
                already keep. Banquets are not replayed: they cook to the final
                count.
              </li>
            </ul>
          </details>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`/backtest/csv?outlet=${current.outlet.slug}`}
              className="btn btn-ghost"
              download
            >
              Download the days (CSV)
            </a>
            {NAV[ctx.role].some((n) => n.href === "/brief") ? (
              <Link href="/brief" className="btn btn-ghost">
                Back to the brief
              </Link>
            ) : null}
          </div>
          <Note>
            Model {MODEL_VERSION}. Change the model, run the history, compare:
            nothing ships without a backtest.
          </Note>
        </div>
      </div>
    </>
  );
}

function MissRow({ p }: { p: ReplayPoint }) {
  const err = (p.actual - p.p50) / p.p50;
  const inRange = p.actual >= p.p10 && p.actual <= p.p90;
  return (
    <Row
      title={dayLabel(p.date, "short")}
      note={`Forecast ${p.p50} (${p.p10}–${p.p90}), served ${p.actual}${p.driver ? ` · biggest signal: ${p.driver}` : ""}`}
      right={`${err > 0 ? "+" : "−"}${Math.abs(err * 100).toFixed(0)}%`}
      pill={inRange ? "In range" : "Outside"}
      tone={inRange ? "mt" : "am"}
    />
  );
}

function Bar({
  v,
  max,
  label,
  gold,
}: {
  v: number;
  max: number;
  label: string;
  gold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-ink/40">
        <div
          className={`h-1.5 rounded-full ${gold ? "bg-gold-light" : "bg-mist/60"}`}
          style={{ width: `${Math.max(3, (v / max) * 100)}%` }}
        />
      </div>
      <span
        className={`num w-11 text-right text-[12.5px] ${gold ? "text-cream" : "text-mist"}`}
      >
        {label}
      </span>
    </div>
  );
}
