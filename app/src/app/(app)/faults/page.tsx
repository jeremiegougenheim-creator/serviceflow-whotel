import { ActionButton } from "@/components/action-button";
import { VoiceLogger } from "@/components/voice-logger";
import { Card, Chip, Grid, Kpi, Note, Row, ScreenHead, Strike, Tabs } from "@/components/ui";
import { undoable } from "@/lib/status";
import { confirmPlannedWorks, updateWorkOrder } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { hhmm, num, plural, plusDays, startOfDayIn } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Maintenance" };

const IMPACT: Record<string, string | null> = { guest_facing: "guest-facing", suites: "suites", in_room: "guest in room", outlet: "outlet", back_of_house: "back of house", none: null };

export default async function FaultsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const view = (["faults", "plant", "planned", "energy"].includes(sp.view ?? "") ? sp.view : "faults") as "faults" | "plant" | "planned" | "energy";
  const supabase = await createClient();
  const tabs = [
    { key: "faults", label: "Faults", href: "/faults" },
    { key: "plant", label: "Plant", href: "/faults?view=plant" },
    { key: "planned", label: "Planned", href: "/faults?view=planned" },
    { key: "energy", label: "Energy", href: "/faults?view=energy" },
  ];
  const tz = ctx.property.timezone;
  const now = new Date(); // server render time, once per request
  const dayStart = startOfDayIn(ctx.today, tz); // the hotel's midnight, not the server's
  const ago = (iso: string) => {
    const h = (now.getTime() - new Date(iso).getTime()) / 36e5;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min open` : h < 48 ? `${Math.round(h)} h open` : `${Math.round(h / 24)} d open`;
  };

  if (view === "faults") {
    const { count: plannedCount } = await supabase.from("planned_works").select("id", { count: "exact", head: true }).eq("property_id", ctx.property.id).gte("starts_at", startOfDayIn(ctx.today, tz)).lte("starts_at", startOfDayIn(plusDays(ctx.today, 8), tz)).neq("status", "cancelled");
    const { data: wos } = await supabase.from("work_orders").select("*, rooms(number), assets(name)").eq("property_id", ctx.property.id).gte("opened_at", new Date(now.getTime() - 7 * 864e5).toISOString()).order("priority").order("opened_at");
    const all = wos ?? [];
    const open = all.filter((w) => w.status === "open" || w.status === "in_progress");
    const counts = { high: open.filter((w) => w.priority === "high").length, medium: open.filter((w) => w.priority === "medium").length, planned: plannedCount ?? 0, closed: all.filter((w) => w.status === "closed" && w.closed_at && w.closed_at >= dayStart).length };
    const impact: Record<string, number> = { guest_facing: 0, suites: 1, in_room: 2, outlet: 3, back_of_house: 4, none: 5 };
    open.sort((a, b) => impact[a.guest_impact] - impact[b.guest_impact] || (a.priority === "high" ? -1 : 1));
    // a fault closed in the last ten minutes keeps its place, with Reopen
    const listed = [...open, ...all.filter((w) => w.status === "closed" && undoable(w.closed_at))];
    const due = (w: (typeof all)[number]) => (w.due_at ? (w.due_at.slice(0, 10) === ctx.today ? (hhmm(w.due_at, tz) >= "22:00" ? "tonight" : hhmm(w.due_at, tz)) : new Date(w.due_at).toLocaleDateString("en-GB", { weekday: "short", timeZone: tz })) : null);
    const guestFacing = open.filter((w) => w.guest_impact === "guest_facing" || w.guest_impact === "suites" || w.guest_impact === "in_room").length;
    return (
      <>
        <ScreenHead
          hi={<>Maintenance, <em>{open.length === 0 ? "nothing open." : guestFacing ? `${plural(guestFacing, "fault")} a guest can feel.` : `${plural(open.length, "fault")} open.`}</em></>}
          sub={`${counts.high} high · ${counts.medium} medium · ${counts.closed} closed today`}
        />
        <Tabs items={tabs} current={view} />
        {mayWrite(ctx, "work_orders_raise") ? <VoiceLogger propertyId={ctx.property.id} outletId={null} serviceDate={ctx.today} department="engineering" placeholder="Log a fault or a fix" examples={["1804 door hinge stiff, guest in room", "Lift B back in service"]} /> : null}
        <div className="mt-4">
          <Grid cols={4}>
            <Kpi k="High" v={counts.high} tone={counts.high ? "rd" : undefined} />
            <Kpi k="Medium" v={counts.medium} tone={counts.medium ? "am" : undefined} />
            <Kpi k="Planned" v={counts.planned} />
            <Kpi k="Closed" v={counts.closed} tone="gn" />
          </Grid>
        </div>
        <div className="mb-1 mt-6 flex items-baseline justify-between">
          <h2 className="text-[20px]">Open faults</h2>
          <span className="muted text-[12.5px]">By guest impact</span>
        </div>
        <Card>
          {listed.map((w) => {
            const pr = w.priority === "high" ? ["High", "rd"] : w.priority === "medium" ? ["Medium", "am"] : ["Low", "mt"];
            const when = due(w);
            const detail = w.detail?.replace(/\s*·?\s*in progress$/i, "") ?? "";
            const impactWord = IMPACT[w.guest_impact];
            const note = [detail, impactWord && !detail.toLowerCase().includes(impactWord) ? impactWord : null, when ? `due ${when}` : null, w.status === "closed" ? null : ago(w.opened_at)].filter(Boolean).join(" · ");
            return (
              <div key={w.id} className="row">
                <div className="t min-w-0">
                  <b>{w.title}</b>
                  <span>{note}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {w.status === "in_progress" ? <Chip entity="work_order" status="in_progress" /> : null}
                    {w.status === "closed" ? <Chip entity="work_order" status="closed" at={w.closed_at} tz={tz} /> : <span className={`pill pill-${pr[1]}`}>{pr[0]}</span>}
                  </div>
                  {mayWrite(ctx, "work_orders") ? (
                    w.status === "closed" ? (
                      <ActionButton small variant="ghost" actionKey={`${w.id}:reopen:${w.closed_at}`} action={updateWorkOrder.bind(null, w.id, "in_progress")} label="Reopen" done="Reopened" />
                    ) : (
                      <ActionButton small variant="tick" actionKey={`${w.id}:${w.status}`} action={updateWorkOrder.bind(null, w.id, w.status === "open" ? "in_progress" : "closed")} label={w.status === "open" ? "Start" : "Close"} done={w.status === "open" ? "Started" : "Closed"} />
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
          {!listed.length ? <Row title="No open fault." /> : null}
        </Card>
        <Note>Ordered by what a guest would notice first. A fault is closed by the person who fixed it.</Note>
      </>
    );
  }

  if (view === "plant") {
    const [{ data: assets }, { data: readings }] = await Promise.all([
      supabase.from("assets").select("*").eq("property_id", ctx.property.id).eq("active", true).order("sort_order"),
      supabase.from("asset_readings").select("asset_id, metric, value, unit, at").eq("property_id", ctx.property.id).gte("at", dayStart).order("at", { ascending: false }),
    ]);
    const list = assets ?? [];
    const online = list.filter((a) => a.status !== "offline").length;
    const chiller = list.find((a) => a.kind === "chiller");
    const loads = (readings ?? []).filter((r) => r.asset_id === chiller?.id && r.metric === "load_pct");
    const now = loads[0] ? Number(loads[0].value) : null;
    const peak = loads.length ? loads.reduce((m, r) => (Number(r.value) > Number(m.value) ? r : m), loads[0]) : null;
    const impactOrder = (a: (typeof list)[number]) => (a.status === "offline" ? 0 : a.status === "watch" ? 1 : a.guest_facing ? 2 : 3);
    return (
      <>
        <ScreenHead hi={<>Plant, <em>{online < list.length ? `${plural(list.length - online, "unit")} out.` : "all running."}</em></>} sub={`${online} of ${list.length} online · readings since midnight`} />
        <Tabs items={tabs} current={view} />
        <Grid>
          <Kpi k="Plant online" v={<>{online}<small>/{list.length}</small></>} n={list.find((a) => a.status === "offline") ? `${list.find((a) => a.status === "offline")!.name} out of service` : "all running"} tone={online < list.length ? "am" : "gn"} />
          <Kpi k="Chiller load" v={now != null ? <>{num(now, 0)}<small>%</small></> : "—"} n={peak ? `peak ${num(peak.value, 0)}% at ${hhmm(peak.at, tz)}` : "no reading today"} />
        </Grid>
        <div className="mb-1 mt-6 flex items-baseline justify-between">
          <h2 className="text-[20px]">Plant</h2>
          <span className="muted text-[12.5px]">By guest impact</span>
        </div>
        <Card>
          {[...list].sort((a, b) => impactOrder(a) - impactOrder(b)).slice(0, 8).map((a) => (
            <Row key={a.id} title={a.name} note={[a.location, a.status_note].filter(Boolean).join(" · ")} pill={a.status === "ok" ? "ok" : a.status} tone={a.status === "ok" ? "gn" : a.status === "watch" ? "am" : a.status === "offline" ? "rd" : "mt"} />
          ))}
        </Card>
      </>
    );
  }

  if (view === "planned") {
    const { data: works } = await supabase.from("planned_works").select("*").eq("property_id", ctx.property.id).gte("starts_at", dayStart).lt("starts_at", startOfDayIn(plusDays(ctx.today, 8), tz)).neq("status", "cancelled").order("starts_at");
    const list = works ?? [];
    const proposed = list.filter((w) => w.status === "proposed");
    const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: tz })} ${hhmm(iso, tz)}`;
    const checks = (w: (typeof list)[number]) => (w.checks ?? {}) as Record<string, string>;
    const label: Record<string, string> = { kitchen: "Kitchen plan", rooms: "Room arrivals", guests: "Guest notices", noise: "Noise", energy: "Energy", arrivals: "Arrivals", vip: "VIP" };
    return (
      <>
        <ScreenHead hi={<>Planned works, <em>{proposed.length ? `${plural(proposed.length, "slot")} to confirm.` : list.length ? "slots confirmed." : "nothing this week."}</em></>} sub={`${plural(list.length, "job")} in the next seven days`} />
        <Tabs items={tabs} current={view} />
        <Strike
          eyebrow="Planned this week"
          title={`${list.length === 0 ? "No job" : list.length === 1 ? "One job" : list.length === 2 ? "Two jobs" : `${list.length} jobs`}, checked against the day.`}
          body="Kitchen plan, room arrivals and guest notices are read before a slot is booked."
          action={proposed.length ? (mayWrite(ctx, "planned_works") ? <ActionButton actionKey={`slots:${proposed.map((w) => w.id).join(",")}`} action={confirmPlannedWorks.bind(null, ctx.property.id, proposed.map((w) => w.id))} label="Confirm the slots" done="Slots confirmed" /> : <span className="pill pill-mt">{proposed.length} proposed</span>) : <span className="btn btn-done">Slots confirmed</span>}
        />
        <div className="mb-1 mt-6 flex items-baseline justify-between">
          <h2 className="text-[20px]">Slots</h2>
          <span className="muted text-[12.5px]">{list.length} planned</span>
        </div>
        <Card>
          {list.map((w) => (
            <Row key={w.id} title={w.title} note={`${when(w.starts_at)} · ${w.duration_min >= 60 ? `${Math.round(w.duration_min / 60)} hours` : `${w.duration_min} min`}${w.areas ? ` · ${w.areas}` : ""}`} pill={w.status === "confirmed" ? "Confirmed" : ({ clear: "Clear", notify: "Notify guests", clash: "Clash" } as Record<string, string>)[w.verdict] ?? w.verdict} tone={w.status === "confirmed" ? "gn" : w.verdict === "clear" ? "gn" : w.verdict === "notify" ? "am" : "rd"} />
          ))}
          {!list.length ? <Row title="Nothing planned this week." /> : null}
        </Card>
        {list.filter((w) => Object.keys(checks(w)).length).slice(0, 3).map((w) => (
          <div key={w.id} className="mt-4">
            <div className="mb-1 text-[14px] font-medium">{w.title}: what was checked</div>
            <Card>
              {Object.entries(checks(w)).filter(([, v]) => v).map(([k, v]) => {
                const clear = /not affected|clear|none|no clash|ok/i.test(String(v));
                return <Row key={k} title={label[k] ?? k.replace(/_/g, " ")} note={String(v)} pill={clear ? "✓ clear" : "check"} tone={clear ? "gn" : "am"} />;
              })}
            </Card>
          </div>
        ))}
      </>
    );
  }

  // energy
  const [{ data: today }, { data: month }] = await Promise.all([
    supabase.from("energy_readings").select("*").eq("property_id", ctx.property.id).eq("service_date", ctx.today),
    supabase.from("energy_readings").select("service_date, kwh").eq("property_id", ctx.property.id).gte("service_date", plusDays(ctx.today, -30)).lt("service_date", ctx.today),
  ]);
  const rows = today ?? [];
  const used = rows.reduce((s, r) => s + Number(r.kwh), 0);
  const baseline = Number((ctx.property.settings as Record<string, number>)?.energy_baseline_kwh_room ?? 0) || null;
  const perRoom = used / ctx.property.keys;
  const vs = baseline ? perRoom / baseline - 1 : null;
  const days = new Set((month ?? []).map((m) => m.service_date)).size;
  const monthKwh = (month ?? []).reduce((s, m) => s + Number(m.kwh), 0);
  const saved = baseline && days ? baseline * ctx.property.keys * days - monthKwh : null;
  const labels: Record<string, [string, string]> = { cooling: ["Cooling", "chillers and AC"], kitchens: ["Kitchens", "extract and cooking"], lifts_lighting: ["Lifts and lighting", "common areas"], other: ["Other", "laundry, pools, back of house"] };
  return (
    <>
      <ScreenHead hi={<>Energy, <em>{vs == null ? "no baseline yet." : vs <= 0 ? `${num(Math.abs(vs) * 100, 0)}% under baseline.` : `${num(vs * 100, 0)}% over baseline.`}</em></>} sub={`${num(used / 1000, 1)} MWh today · ${ctx.property.keys} rooms`} />
      <Tabs items={tabs} current={view} />
      <Grid>
        <Kpi k="Used today" v={<>{num(used / 1000, 1)}<small>MWh</small></>} n={`≈ ${num(perRoom, 0)} kWh per room`} />
        <Kpi k="On baseline" v={vs != null ? <>{vs > 0 ? "+" : "−"}{num(Math.abs(vs) * 100, 0)}<small>%</small></> : "—"} n={saved != null ? `${num(Math.abs(saved) / 1000, 1)} MWh ${saved >= 0 ? "saved" : "over"} in 30 days` : "set a baseline in Set-up"} tone={vs != null ? (vs <= 0 ? "gn" : "am") : undefined} />
      </Grid>
      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">Where it goes</h2>
        <span className="muted text-[12.5px]">MWh today</span>
      </div>
      <Card>
        {[...rows].sort((a, b) => Number(b.kwh) - Number(a.kwh)).map((r) => (
          <Row key={r.id} title={labels[r.category]?.[0] ?? r.category} note={r.note ?? labels[r.category]?.[1]} right={num(Number(r.kwh) / 1000, 1)} />
        ))}
        {!rows.length ? <Row title="No meter reading today." note="Import readings in Set-up → Imports." /> : null}
      </Card>
      <Note>Metered. Feeds the owner&rsquo;s ESG report.</Note>
    </>
  );
}
