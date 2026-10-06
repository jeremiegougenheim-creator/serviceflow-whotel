import { ActionButton } from "@/components/action-button";
import { Card, Empty, Note, Row, Strike, Tabs } from "@/components/ui";
import { applyRosterSuggestion, dismissRosterSuggestion } from "@/lib/actions/ops";
import { getContext } from "@/lib/data/context";
import { getStaffingWeek } from "@/lib/data/fnb";
import { mondayOf, num, plusDays, signed } from "@/lib/format";
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
  const byLine = new Map<string, { name: string; planned: number; demand: number }>();
  for (const l of lines ?? []) byLine.set(l.id, { name: l.name, planned: 0, demand: 0 });
  for (const r of rows) {
    const g = byLine.get(r.service_line_id ?? "");
    if (!g) continue;
    g.planned += Number(r.planned_hours ?? 0);
    g.demand += Number(r.demand_hours ?? 0);
  }
  const top = suggestions?.[0];
  const isNext = monday !== thisMonday;

  return (
    <>
      <Tabs items={[{ key: "this", label: "This week", href: "/roster" }, { key: "next", label: "Next week", href: "/roster?week=next" }]} current={isNext ? "next" : "this"} />
      {top ? (
        <Strike
          eyebrow={isNext ? "Draft roster · next week" : "Before the week starts"}
          title={top.title}
          body={top.detail}
          action={
            <div className="flex gap-2">
              <ActionButton action={applyRosterSuggestion.bind(null, top.id)} label="Apply the change" done="Change applied" />
              <ActionButton variant="ghost" action={dismissRosterSuggestion.bind(null, top.id)} label="Not this time" done="Dismissed" />
            </div>
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
          <ActionButton small action={applyRosterSuggestion.bind(null, s.id)} label="Apply" done="Applied" />
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
            return <Row key={g.name} title={g.name} note={`${num(g.planned, 0)} h planned · ${num(g.demand, 0)} h demand`} pill={Math.abs(d) < 1 ? "on plan" : signed(Math.round(d), " h")} tone={Math.abs(d) < 1 ? "gn" : d < 0 ? "am" : "mt"} />;
          })}
        </Card>
      ) : (
        <Empty>No service lines yet. Add them in Set-up → Staffing.</Empty>
      )}
      <Note>Forecast first. Hours follow the covers, not last week&rsquo;s rota.</Note>
    </>
  );
}
