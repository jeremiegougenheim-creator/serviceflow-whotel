import type { ReplayPoint } from "@/lib/engine/backtest";
import { dayLabel } from "@/lib/format";

/**
 * Actual covers against the forecast's range, the forecast and habit, one point a day.
 * Drawn on the server as SVG that stretches to the card; strokes and dots keep their size at
 * any width (non-scaling strokes; a dot is a zero-length round-capped stroke). Labels are HTML.
 */
export function BacktestChart({ points, label }: { points: ReplayPoint[]; label: string }) {
  if (points.length < 2) return null;
  const W = 1000;
  const H = 300;
  const lo = Math.min(...points.flatMap((p) => [p.actual, p.p10, p.habit]));
  const hi = Math.max(...points.flatMap((p) => [p.actual, p.p90, p.habit]));
  const pad = Math.max(2, (hi - lo) * 0.08);
  const y0 = Math.floor(lo - pad);
  const y1 = Math.ceil(hi + pad);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - y0) / (y1 - y0)) * H;
  const line = (f: (p: ReplayPoint) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(f(p)).toFixed(1)}`).join("");
  const band = `${points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.p90).toFixed(1)}`).join("")}${[...points]
    .reverse()
    .map((p, j) => `L${x(points.length - 1 - j).toFixed(1)} ${y(p.p10).toFixed(1)}`)
    .join("")}Z`;
  const dots = points.map((p, i) => `M${x(i).toFixed(1)} ${y(p.actual).toFixed(1)}l0 0`).join("");
  const missed = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.actual < p.p10 || p.actual > p.p90)
    .map(({ p, i }) => `M${x(i).toFixed(1)} ${y(p.actual).toFixed(1)}l0 0`)
    .join("");
  const mid = points[Math.floor(points.length / 2)];
  const ticks = [y1, Math.round((y0 + y1) / 2), y0];

  return (
    <figure className="card px-3 pb-3 pt-4 md:px-4">
      <div className="relative pl-9">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-8 flex-col justify-between num text-right text-[11px] text-mist" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-44 w-full md:h-56" role="img" aria-label={label}>
          {ticks.map((t) => (
            <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} stroke="var(--sf-rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={band} fill="var(--color-gold)" fillOpacity="0.14" stroke="none" />
          <path d={line((p) => p.habit)} fill="none" stroke="var(--color-mist)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={line((p) => p.p50)} fill="none" stroke="var(--color-gold-light)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={dots} fill="none" stroke="var(--color-cream)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {missed ? <path d={missed} fill="none" stroke="var(--color-amber)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
      </div>
      <div className="mt-1.5 flex justify-between pl-9 text-[11px] text-mist" aria-hidden>
        <span>{dayLabel(points[0].date, "short")}</span>
        <span>{dayLabel(mid.date, "short")}</span>
        <span>{dayLabel(points.at(-1)!.date, "short")}</span>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-mist">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-full bg-cream" /> Actual covers
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-full bg-amber" /> Outside the range
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-0.5 w-4 bg-gold-light" /> ServiceFlow
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-4 rounded-sm bg-gold/20" /> Range (P10–P90)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4 border-t-[1.5px] border-dashed border-mist" /> Habit
        </span>
      </figcaption>
    </figure>
  );
}
