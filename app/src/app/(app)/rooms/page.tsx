import { ActionButton } from "@/components/action-button";
import { VoiceLogger } from "@/components/voice-logger";
import { Card, Grid, Kpi, Note, Row, Strike, Tabs } from "@/components/ui";
import { assignInspections, updateRoomTask } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { num, timeShort } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Rooms" };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const view = (["all", "departures", "vip", "done"].includes(sp.view ?? "") ? sp.view : "all") as "all" | "departures" | "vip" | "done";
  const supabase = await createClient();
  const { data: tasks } = await supabase.from("room_tasks").select("*, rooms(number, floor, room_type, is_suite, target_minutes)").eq("property_id", ctx.property.id).eq("service_date", ctx.today).order("priority").order("needed_by", { nullsFirst: false });
  const all = (tasks ?? []) as (NonNullable<typeof tasks>[number] & { rooms: { number: string; floor: number | null; room_type: string; is_suite: boolean; target_minutes: number } | null })[];
  const done = all.filter((t) => t.status === "done" || t.status === "inspected");
  const inspected = all.filter((t) => t.status === "inspected");
  const todo = all.filter((t) => t.status === "todo" || t.status === "in_progress");
  const vip = all.filter((t) => t.vip || t.kind === "vip_arrival");
  const deps = all.filter((t) => t.kind === "departure");
  const minutes = done.filter((t) => t.minutes).map((t) => t.minutes!);
  const avgMin = minutes.length ? minutes.reduce((s, m) => s + m, 0) / minutes.length : null;
  const targets = all.map((t) => t.rooms?.target_minutes ?? 25);
  const tLo = targets.length ? Math.min(...targets) : 24;
  const tHi = targets.length ? Math.max(...targets) : 26;
  const tabs = [
    { key: "all", label: "All", href: "/rooms" },
    { key: "departures", label: "Departures", href: "/rooms?view=departures" },
    { key: "vip", label: "VIP", href: "/rooms?view=vip" },
    { key: "done", label: "Done", href: "/rooms?view=done" },
  ];
  const kindPill = (t: (typeof all)[number]) => (t.vip || t.kind === "vip_arrival" ? ["VIP", "gd"] : t.kind === "departure" ? ["DEP", "am"] : t.kind === "deep_clean" ? ["DEEP", "mt"] : ["STAY", "mt"]) as [string, "gd" | "am" | "mt"];
  const line = (t: (typeof all)[number]) => {
    const parts: string[] = [];
    if (t.kind === "vip_arrival" || t.arrival_at) parts.push(`${t.vip ? "VIP " : ""}arrival ${timeShort(t.arrival_at ?? t.needed_by ?? "")}`);
    else if (t.kind === "departure") parts.push(`departure ${timeShort(t.departure_at ?? "")}`);
    else parts.push("stayover");
    if (t.notes) parts.push(t.notes);
    return parts.join(" · ");
  };

  return (
    <>
      <Tabs items={tabs} current={view} />
      {view === "all" ? (
        <>
          {mayWrite(ctx, "room_tasks") ? <VoiceLogger propertyId={ctx.property.id} outletId={null} serviceDate={ctx.today} department="housekeeping" placeholder="Log a room, in English or Chinese" examples={["2506 done, 24 minutes", "2506 完成 24 分钟"]} /> : null}
          <div className="mt-4">
            <Grid>
              <Kpi k="Min per room" v={avgMin != null ? num(avgMin, 1) : "—"} n={`target ${tLo}–${tHi}`} tone={avgMin != null && avgMin > tHi ? "am" : undefined} />
              <Kpi k="Rooms done" v={<>{done.length}<small>/{all.length}</small></>} n={`${all.filter((t) => t.vip || t.kind === "vip_arrival" || t.rooms?.is_suite).length} VIP and suites`} />
            </Grid>
          </div>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Next rooms</h2>
            <span className="muted text-[12.5px]">Priority order</span>
          </div>
          <Card>
            {todo.slice(0, 8).map((t) => {
              const [p, tone] = kindPill(t);
              return (
                <div key={t.id} className="row">
                  <div className="t min-w-0">
                    <b>
                      {t.rooms?.number} · {t.rooms?.room_type}
                    </b>
                    <span>{line(t)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`pill pill-${tone}`}>{p}</span>
                    {mayWrite(ctx, "room_tasks") ? <ActionButton small variant="ghost" action={updateRoomTask.bind(null, t.id, "done", undefined)} label="Done" done="Done" /> : null}
                  </div>
                </div>
              );
            })}
            {!todo.length ? <Row title="Every room is done." /> : null}
          </Card>
          <Note>After the F&B pilot. Same platform, same approvals.</Note>
        </>
      ) : view === "departures" ? (
        <>
          <Grid>
            <Kpi k="Checked out" v={<>{deps.filter((t) => t.status !== "todo").length}<small>/{deps.length}</small></>} n={`${deps.filter((t) => t.status === "todo").length} still in house`} />
            <Kpi k="Min per departure" v={(() => { const m = deps.filter((t) => t.minutes).map((t) => t.minutes!); return m.length ? num(m.reduce((s, x) => s + x, 0) / m.length, 0) : "—"; })()} n={`target ${tHi + 9}–${tHi + 11}`} />
          </Grid>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Still to clear</h2>
            <span className="muted text-[12.5px]">{deps.filter((t) => t.status === "todo" || t.status === "in_progress").length} left</span>
          </div>
          <Card>
            {deps.filter((t) => t.status === "todo" || t.status === "in_progress").sort((a, b) => (a.needed_by ?? "99").localeCompare(b.needed_by ?? "99")).slice(0, 10).map((t) => (
              <Row key={t.id} title={`${t.rooms?.number} · ${t.rooms?.room_type}`} note={line(t)} right={<span className="text-[18px]">{timeShort(t.departure_at ?? "")}</span>} />
            ))}
          </Card>
          <Note>Arrivals first. {all.filter((t) => t.needed_by && t.needed_by <= "14:00:00").length} rooms are needed by 14:00, and the order follows that.</Note>
        </>
      ) : view === "vip" ? (
        <>
          <Strike
            eyebrow="VIP and suites today"
            title={vip.find((t) => t.status !== "inspected") ? `${vip.find((t) => t.status !== "inspected")!.rooms?.room_type} ${vip.find((t) => t.status !== "inspected")!.rooms?.number} needs a final check.` : "Every VIP room is inspected."}
            tiles={[
              { b: vip.length, s: "VIP today" },
              { b: vip.filter((t) => t.status === "inspected").length, s: "ready" },
              { b: vip.filter((t) => t.status !== "inspected").length, s: "to do" },
            ]}
            action={mayWrite(ctx, "room_tasks") ? <ActionButton action={assignInspections.bind(null, ctx.property.id, ctx.today)} label="Assign the inspection" done="Inspection assigned" /> : undefined}
          />
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Arrivals</h2>
            <span className="muted text-[12.5px]">Priority order</span>
          </div>
          <Card>
            {vip.sort((a, b) => (a.status === "inspected" ? 1 : 0) - (b.status === "inspected" ? 1 : 0) || (a.arrival_at ?? "99").localeCompare(b.arrival_at ?? "99")).slice(0, 10).map((t) => (
              <div key={t.id} className="row">
                <div className="t min-w-0">
                  <b>
                    {t.rooms?.number} · {t.rooms?.room_type}
                  </b>
                  <span>{t.status === "inspected" ? `inspected ${t.inspected_at ? new Date(t.inspected_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ctx.property.timezone }) : ""}` : line(t)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.status === "inspected" ? <span className="pill pill-gn">ready</span> : t.status === "done" && mayWrite(ctx, "room_tasks") ? <ActionButton small action={updateRoomTask.bind(null, t.id, "inspected", undefined)} label="Inspected" done="Inspected" /> : t.status === "done" ? <span className="pill pill-mt">done</span> : <span className="text-[18px]">{timeShort(t.arrival_at ?? t.needed_by ?? "")}</span>}
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <>
          <Grid>
            <Kpi k="Rooms done" v={<>{done.length}<small>/{all.length}</small></>} n={`${Math.round((done.length / Math.max(1, all.length)) * 100)}% of the day`} />
            <Kpi k="Inspected" v={<>{inspected.length}<small>/{done.length}</small></>} n={`${done.length - inspected.length} waiting for a check`} />
          </Grid>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">By floor</h2>
            <span className="muted text-[12.5px]">Minutes per room</span>
          </div>
          <Card>
            {floorBands(all).map((b) => (
              <Row key={b.label} title={b.label} note={`${b.done} of ${b.total} · ${b.avg != null ? num(b.avg, 0) + " min" : "—"}${b.suites ? " · suites" : ""}`} pill={b.avg != null && b.avg > b.target + 2 ? "behind" : "on pace"} tone={b.avg != null && b.avg > b.target + 2 ? "am" : "gn"} />
            ))}
          </Card>
          <Note>Suites take longer, and the nightly report asks for one more attendant when the suite floors run slow.</Note>
        </>
      )}
    </>
  );
}

function floorBands(tasks: { status: string; minutes: number | null; rooms: { floor: number | null; is_suite: boolean; target_minutes: number } | null }[]) {
  const bands: { label: string; lo: number; hi: number }[] = [];
  const floors = [...new Set(tasks.map((t) => t.rooms?.floor ?? 0))].sort((a, b) => b - a);
  for (let i = 0; i < floors.length; i += 4) {
    const grp = floors.slice(i, i + 4);
    bands.push({ label: `Floors ${Math.min(...grp)}–${Math.max(...grp)}`, lo: Math.min(...grp), hi: Math.max(...grp) });
  }
  return bands.map((b) => {
    const t = tasks.filter((x) => (x.rooms?.floor ?? 0) >= b.lo && (x.rooms?.floor ?? 0) <= b.hi);
    const done = t.filter((x) => x.status === "done" || x.status === "inspected");
    const m = done.filter((x) => x.minutes).map((x) => x.minutes!);
    return { label: b.label, total: t.length, done: done.length, avg: m.length ? m.reduce((s, x) => s + x, 0) / m.length : null, suites: t.some((x) => x.rooms?.is_suite), target: t[0]?.rooms?.target_minutes ?? 25 };
  }).slice(0, 5);
}
