import { ActionButton, ActionGroup } from "@/components/action-button";
import { Card, Chip, Empty, Note, Row, ScreenHead, Strike, Tabs } from "@/components/ui";
import { applyRosterSuggestion, dismissRosterSuggestion } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { getStaffingWeek } from "@/lib/data/fnb";
import { dayLabel, mondayOf, num, plusDays, signed, weekday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Roster" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const thisMonday = mondayOf(ctx.today);
  const monday = sp.week === "next" ? plusDays(thisMonday, 7) : thisMonday;
  const supabase = await createClient();
  const [rows, { data: suggestions }, { data: lines }] = await Promise.all([
    getStaffingWeek(ctx, monday),
    supabase.from("roster_suggestions").select("*").eq("property_id", ctx.property.id).eq("week_start", monday).eq("status", "proposed").order("delta_hours").limit(3),
    supabase.from("service_lines").select("id, name, department, sort_order").eq("property_id", ctx.property.id).eq("active", true).order("sort_order"),
  ]);
  const shortDates = new Set<string>();
  const byLine = new Map<string, { name: string; department: string; planned: number; demand: number; short: string[]; days: Map<string, { planned: number; demand: number }> }>();
  for (const l of lines ?? []) byLine.set(l.id, { name: l.name, department: l.department, planned: 0, demand: 0, short: [], days: new Map() });
  for (const r of rows) {
    const g = byLine.get(r.service_line_id ?? "");
    if (!g) continue;
    g.planned += Number(r.planned_hours ?? 0);
    g.demand += Number(r.demand_hours ?? 0);
    if (r.service_date) g.days.set(r.service_date, { planned: Number(r.planned_hours ?? 0), demand: Number(r.demand_hours ?? 0) });
    const d = Number(r.delta_hours ?? 0);
    if (d <= -1 && r.service_date) {
      g.short.push(`${weekday(r.service_date).slice(0, 3)} −${Math.round(-d)} h`);
      shortDates.add(r.service_date);
    }
  }
  const shortDays = shortDates.size;
  const top = suggestions?.[0];
  const isNext = monday !== thisMonday;

  return (
    <>
      <ScreenHead
        hi={<>{isNext ? "Next week" : "This week"}, <em>{shortDays === 0 ? "hours on demand." : shortDays === 1 ? "one short day." : `${shortDays} short days.`}</em></>}
        sub={`Week of ${dayLabel(monday, "short").replace(/^\w+ /, "")} · ${byLine.size} service lines · hours planned against the covers forecast`}
      />
      <Tabs items={[{ key: "this", label: "This week", href: "/roster" }, { key: "next", label: "Next week", href: "/roster?week=next" }]} current={isNext ? "next" : "this"} />
      {top ? (
        <Strike
          key={top.id}
          eyebrow={isNext ? "Draft roster · next week" : "This week"}
          title={top.title}
          body={top.detail}
          action={
            mayWrite(ctx, "roster_suggestions") ? (
              <ActionGroup className="flex flex-wrap gap-2">
                <ActionButton actionKey={`${top.id}:apply`} action={applyRosterSuggestion.bind(null, top.id)} label="Approve the move" done="Move applied" />
                <ActionButton variant="ghost" actionKey={`${top.id}:dismiss`} action={dismissRosterSuggestion.bind(null, top.id)} label="Not now" done="Set aside" />
              </ActionGroup>
            ) : undefined
          }
        />
      ) : (
        <Strike eyebrow={isNext ? "Draft roster · next week" : "This week"} title="Hours are on demand." body="No line is short by more than an hour against the covers forecast." />
      )}
      {(suggestions ?? []).slice(1).map((s) => (
        <div key={s.id} className="card mt-2.5 flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14.5px] font-medium">{s.title}</div>
            <div className="muted text-[13px]">{s.detail}</div>
          </div>
          {mayWrite(ctx, "roster_suggestions") ? <ActionButton small actionKey={`${s.id}:apply`} action={applyRosterSuggestion.bind(null, s.id)} label="Approve" done="Applied" /> : <Chip entity="roster" status="proposed" />}
        </div>
      ))}

      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">Hours against demand</h2>
        <span className="muted text-[12.5px]">week of {dayLabel(monday, "short").replace(/^\w+ /, "")}</span>
      </div>
      {byLine.size ? (
        <>
        <WeekGrid monday={monday} today={ctx.today} lines={[...byLine.values()]} />
        <Card className="md:hidden">
          {[...byLine.values()].map((g) => {
            const d = g.planned - g.demand;
            return (
              <Row
                key={g.name}
                title={g.name}
                note={`${num(g.planned, 0)} h planned · ${num(g.demand, 0)} h demand${g.short.length ? ` · short ${g.short.join(", ")}` : ""}`}
                right={<span className="text-[13px] text-mist">week</span>}
                pill={Math.abs(d) < 1 ? "on plan" : <span className="normal-case">{signed(Math.round(d), " h")}</span>}
                tone={g.short.length ? "am" : Math.abs(d) < 1 ? "gn" : "mt"}
              />
            );
          })}
        </Card>
        </>
      ) : (
        <Empty>No service lines yet. Add them in Set-up → Staffing.</Empty>
      )}
      <Note>Forecast first. Hours follow the covers, not last week&rsquo;s rota.</Note>
    </>
  );
}

/**
 * Tablet and desktop: the week as a grid, one service line a row, one day a column. Each cell
 * reads planned against demand; a short day is amber, spare hours are quiet.
 */
function WeekGrid({ monday, today, lines }: { monday: string; today: string; lines: { name: string; department: string; planned: number; demand: number; days: Map<string, { planned: number; demand: number }> }[] }) {
  const days = Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
  const label = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const dayShort = days.map((d) => lines.reduce((s, l) => { const c = l.days.get(d); return s + (c && c.planned - c.demand <= -1 ? c.planned - c.demand : 0); }, 0));
  return (
    <div className="card hidden overflow-x-auto px-2 py-1 md:block">
      <table className="w-full table-fixed text-[13.5px]">
        <caption className="sr-only">Hours planned against demand, by service line and day</caption>
        <colgroup>
          <col className="w-[30%] lg:w-[24%]" />
          {days.map((d) => (
            <col key={d} />
          ))}
          <col className="w-[11%]" />
        </colgroup>
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.1em] text-mist">
            <th scope="col" className="px-2 py-3 text-left font-medium">
              Line
            </th>
            {days.map((d, i) => (
              <th key={d} scope="col" className={`px-1 py-3 text-center font-medium ${d === today ? "text-gold-light" : ""}`}>
                {label(d)}
                {dayShort[i] <= -1 ? <span className="block text-[10.5px] normal-case tracking-normal text-amber">{signed(Math.round(dayShort[i]), " h")}</span> : <span className="block text-[10.5px] opacity-0">·</span>}
              </th>
            ))}
            <th scope="col" className="px-2 py-3 text-right font-medium">
              Week
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const wk = l.planned - l.demand;
            return (
              <tr key={l.name} className="border-t border-(--sf-rule)">
                <th scope="row" className="px-2 py-2.5 text-left font-medium">
                  {l.name}
                  <span className="block text-[11.5px] font-normal capitalize text-mist">{l.department}</span>
                </th>
                {days.map((d) => {
                  const c = l.days.get(d);
                  if (!c || (c.planned === 0 && c.demand === 0)) return <td key={d} className="px-1 py-2.5 text-center text-mist">·</td>;
                  const delta = c.planned - c.demand;
                  const short = delta <= -1;
                  const spare = delta >= 1;
                  return (
                    <td key={d} className="px-1 py-1.5 text-center">
                      <div className={`num rounded-lg px-1 py-1.5 ${short ? "bg-amber/15 text-amber" : spare ? "text-mist" : "text-cream"}`} title={`${num(c.planned, 0)} h planned, ${num(c.demand, 0)} h demand`}>
                        <b className="block text-[15px] font-medium">{Math.abs(delta) < 1 ? "✓" : signed(Math.round(delta), "")}</b>
                        <span className="block text-[11px] opacity-80">
                          {num(c.planned, 0)}/{num(c.demand, 0)}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className={`num px-2 py-2.5 text-right ${wk <= -1 ? "text-amber" : ""}`}>{Math.abs(wk) < 1 ? "on plan" : signed(Math.round(wk), " h")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted px-2 pb-2 pt-1 text-[12px]">Each cell: hours over or under demand, then planned / demand. ✓ = within an hour.</p>
    </div>
  );
}
