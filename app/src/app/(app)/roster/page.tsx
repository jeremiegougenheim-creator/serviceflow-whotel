import { ActionButton, ActionGroup } from "@/components/action-button";
import { Card, Chip, Empty, Note, Row, ScreenHead, Strike, Tabs } from "@/components/ui";
import { applyRosterSuggestion, dismissRosterSuggestion } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { getStaffingWeek } from "@/lib/data/fnb";
import { mondayOf, num, plusDays, signed, weekday } from "@/lib/format";
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
  const byLine = new Map<string, { name: string; planned: number; demand: number; short: string[] }>();
  for (const l of lines ?? []) byLine.set(l.id, { name: l.name, planned: 0, demand: 0, short: [] });
  for (const r of rows) {
    const g = byLine.get(r.service_line_id ?? "");
    if (!g) continue;
    g.planned += Number(r.planned_hours ?? 0);
    g.demand += Number(r.demand_hours ?? 0);
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
        sub={`Week of ${monday} · ${byLine.size} service lines · hours planned against the covers forecast`}
      />
      <Tabs items={[{ key: "this", label: "This week", href: "/roster" }, { key: "next", label: "Next week", href: "/roster?week=next" }]} current={isNext ? "next" : "this"} />
      {top ? (
        <Strike
          key={top.id}
          eyebrow={isNext ? "Draft roster · next week" : "Before the week starts"}
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
        <span className="muted text-[12.5px]">week of {monday}</span>
      </div>
      {byLine.size ? (
        <Card>
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
      ) : (
        <Empty>No service lines yet. Add them in Set-up → Staffing.</Empty>
      )}
      <Note>Forecast first. Hours follow the covers, not last week&rsquo;s rota.</Note>
    </>
  );
}
