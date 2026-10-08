import { ActionButton, ActionGroup } from "@/components/action-button";
import { VoiceLogger } from "@/components/voice-logger";
import { Card, Chip, Empty, ScreenHead, Tabs } from "@/components/ui";
import { actOnLiveEvent, setStationStatus } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { getLatestForecast, getOutlets, getPlanLines, groupPlan, serviceDateFor } from "@/lib/data/fnb";
import { hhmm, num, timeShort } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Live" };

const KIND: Record<string, string> = { cover_check: "Cover check", pace: "Cover check", running_fast: "Running fast", waste_risk: "Waste risk", group_arrival: "Group arriving", info: "Note", flag: "Flag" };

export default async function LivePage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const outlets = await getOutlets(ctx);
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets.find((o) => o.outlet_type === "breakfast") ?? outlets[0];
  if (!outlet) return <Empty>No outlet configured yet.</Empty>;
  const date = ctx.clock < outlet.closes_at.slice(0, 5) || outlet.closes_at < outlet.opens_at ? ctx.today : serviceDateFor(ctx, outlet);
  const supabase = await createClient();
  const [f, { data: events }, { data: pace }] = await Promise.all([
    getLatestForecast(outlet.id, date),
    supabase.from("live_events").select("*").eq("outlet_id", outlet.id).eq("service_date", date).order("at"),
    supabase.from("pos_pace").select("at, covers_seated").eq("outlet_id", outlet.id).eq("service_date", date).order("at", { ascending: false }).limit(1),
  ]);
  const groups = f ? groupPlan(await getPlanLines(f.id)) : [];
  const seated = pace?.[0]?.covers_seated ?? null;
  // only the newest open proposal of each kind (and station) still asks; older ones are superseded
  const all = events ?? [];
  const newestOpen = new Map<string, string>();
  for (const e of all) if (e.status === "open") newestOpen.set(`${e.kind}:${e.station_id ?? ""}`, e.id);
  const superseded = new Set(all.filter((e) => e.status === "open" && newestOpen.get(`${e.kind}:${e.station_id ?? ""}`) !== e.id).map((e) => e.id));
  const pendingEvents = all.filter((e) => e.status === "open" && !superseded.has(e.id)).reverse();
  const pastEvents = all.filter((e) => e.status !== "open" || superseded.has(e.id)).reverse();
  // the bottom nav already holds Plan and Waste for the kitchen: no second row of the same tabs
  const kitchenNav = ["chef", "sous_chef", "prep_cook", "fnb_mgr"].includes(ctx.role);
  const tabs = [
    { key: "live", label: "Live", href: `/live?outlet=${outlet.slug}` },
    { key: "plan", label: "Plan", href: `/plan?outlet=${outlet.slug}` },
    { key: "waste", label: "Waste log", href: `/waste?outlet=${outlet.slug}` },
  ];

  return (
    <>
      <ScreenHead
        hi={<>{outlet.name}, <em>{seated != null && f ? (seated > f.covers_p50 * 1.05 ? "running ahead." : seated < f.covers_p50 * 0.9 && ctx.clock > outlet.closes_at.slice(0, 5) ? "closed under forecast." : "on pace.") : f ? "live." : "no plan yet."}</em></>}
        sub={`${seated != null ? `${seated} seated` : "no cover count yet"}${f ? ` · ${f.covers_p50} forecast` : ""} · ${ctx.clock}`}
      />
      {kitchenNav ? null : <Tabs items={tabs} current="live" />}
      {outlets.length > 1 ? (
        <div className="scroll-x -mx-4 mb-4 px-4">
          <div className="tabs">
            {outlets.map((o) => (
              <a key={o.id} href={`/live?outlet=${o.slug}`} className={o.id === outlet.id ? "on" : ""}>
                {o.name}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {mayWrite(ctx, "waste_logs") ? <VoiceLogger propertyId={ctx.property.id} outletId={outlet.id} serviceDate={date} department="kitchen" placeholder="Log a count, a station or a fix" examples={["Western hot over-prep 2 kg", "142 seated", "eggs ready"]} /> : null}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-6 xl:pt-5">
        <section className="min-w-0 xl:col-start-2 xl:row-start-1" aria-label="Proposals">
        {pendingEvents.length ? (
          <div className="mt-5 flex flex-col gap-2.5 xl:mt-0">
            {pendingEvents.map((e) => (
              <div key={e.id} className="card px-4 py-3.5">
                <div className="flex items-baseline gap-3">
                  <span className="muted num text-[12px]">{hhmm(e.at, ctx.property.timezone)}</span>
                  <span className={`text-[11px] uppercase tracking-[0.14em] ${e.kind === "waste_risk" ? "text-amber" : e.kind === "running_fast" ? "text-gold-light" : "text-mist"}`}>{KIND[e.kind] ?? e.kind.replace(/_/g, " ")}</span>
                </div>
                <div className="mt-1 text-[16px] font-medium">{e.title}</div>
                {e.body ? <p className="muted mt-0.5 text-[13.5px]">{e.body}</p> : null}
                {e.proposal && mayWrite(ctx, "live_events") ? (
                  <ActionGroup className="mt-3 flex gap-2">
                    <ActionButton small actionKey={`${e.id}:ok`} action={actOnLiveEvent.bind(null, e.id, "approved")} label="Approve" done="Approved" />
                    <ActionButton small variant="ghost" actionKey={`${e.id}:no`} action={actOnLiveEvent.bind(null, e.id, "dismissed")} label="Not now" done="Not now" />
                  </ActionGroup>
                ) : (
                  <Chip entity="live" status="open" className="mt-3" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 xl:mt-0">
            <Empty>{f ? "Service is quiet: pace on forecast, no station running fast." : "No plan for this service yet."}</Empty>
          </div>
        )}
        </section>
        {groups.length ? (
          <section className="min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1" aria-labelledby="sf-stations">
            <div className="mb-1 mt-6 flex items-baseline justify-between xl:mt-0">
              <h2 id="sf-stations" className="text-[20px]">
                Stations
              </h2>
              <span className="muted text-[12.5px]">tick off as you go</span>
            </div>
            {/* phone: a list; tablet and up: one tile per station, big enough for a gloved thumb */}
            <Card className="md:hidden">
              {groups.map((g) => (
                <div key={g.station.id} className="row">
                  <div className="t min-w-0">
                    <b>{g.station.name}</b>
                    <span>{qtyLine(g)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StationActions g={g} canWrite={mayWrite(ctx, "plans")} small />
                  </div>
                </div>
              ))}
            </Card>
            <div className="hidden gap-2.5 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
              {groups.map((g) => (
                <div key={g.station.id} className={`card flex min-h-[168px] flex-col gap-3 p-4 ${g.status === "running_low" ? "!border-amber/60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-[17px] font-medium leading-snug">{g.station.name}</b>
                    <Chip entity="station" status={g.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {g.lines.map((l) => (
                      <div key={l.id} className="leading-none">
                        <span className="num font-display text-[30px]">{num(l.qty, g.station.unit === "L" ? 1 : 0)}</span>
                        <span className="muted ml-1 text-[12.5px]">
                          {g.station.unit !== "portions" ? `${g.station.unit} ` : ""}at {timeShort(l.waves?.starts_at ?? "")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex gap-2 [&>*]:flex-1">
                    <StationActions g={g} canWrite={mayWrite(ctx, "plans")} hideChip />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {pastEvents.length ? (
          <section className="min-w-0 xl:col-start-2">
            <div className="mb-1 mt-6 flex items-baseline justify-between">
              <h2 className="text-[20px]">Earlier this service</h2>
              <span className="muted text-[12.5px]">{pastEvents.length}</span>
            </div>
            <Card>
              {pastEvents.map((e) => (
                <div key={e.id} className="row">
                  <div className="t min-w-0">
                    <b className="!font-normal">
                      <span className="muted num mr-2 text-[12.5px]">{hhmm(e.at, ctx.property.timezone)}</span>
                      {e.title}
                    </b>
                  </div>
                  <Chip entity="live" status={superseded.has(e.id) ? "superseded" : e.status} at={e.acted_at} tz={ctx.property.timezone} />
                </div>
              ))}
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}

type Group = ReturnType<typeof groupPlan>[number];

function qtyLine(g: Group): string {
  return g.lines.map((l, i) => `${i === 0 ? "" : "+"}${num(l.qty, g.station.unit === "L" ? 1 : 0)}${g.station.unit !== "portions" ? ` ${g.station.unit}` : ""} at ${timeShort(l.waves?.starts_at ?? "")}`).join(" · ");
}

/** Prepped, Low, Topped up: every line of the station at once. A closed station only shows its status. */
function StationActions({ g, canWrite, small, hideChip }: { g: Group; canWrite: boolean; small?: boolean; hideChip?: boolean }) {
  const ids = g.lines.map((l) => l.id);
  const set = (status: "prepped" | "running_low", label: string) => async () => {
    "use server";
    for (const id of ids) {
      const r = await setStationStatus(id, status);
      if (!r.ok) return r;
    }
    return { ok: true as const, label };
  };
  if (g.status === "closed" || !canWrite) return hideChip ? null : <Chip entity="station" status={g.status} />;
  if (g.status === "running_low") {
    return (
      <>
        {hideChip ? null : <Chip entity="station" status="running_low" />}
        <ActionButton small={small} variant="tick" action={set("prepped", "Topped up")} label="Topped up" done="Topped up" actionKey={`${g.station.id}:top`} />
      </>
    );
  }
  return (
    <>
      {g.status !== "prepped" ? <ActionButton small={small} variant="tick" actionKey={`${g.station.id}:prep`} action={set("prepped", "Prepped")} label="Prepped" done="Prepped" /> : hideChip ? null : <Chip entity="station" status="prepped" />}
      <ActionButton small={small} variant="ghost" action={set("running_low", "Marked low")} label="Low" done="Marked low" actionKey={`${g.station.id}:low`} />
    </>
  );
}
