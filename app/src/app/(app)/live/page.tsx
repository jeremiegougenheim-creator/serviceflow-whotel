import { ActionButton } from "@/components/action-button";
import { VoiceLogger } from "@/components/voice-logger";
import { Card, Empty, Tabs } from "@/components/ui";
import { actOnLiveEvent, setStationStatus } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { getLatestForecast, getOutlets, getPlanLines, groupPlan, serviceDateFor } from "@/lib/data/fnb";
import { hhmm, num, timeShort } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Live" };

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
  const tabs = [
    { key: "live", label: "Live", href: `/live?outlet=${outlet.slug}` },
    { key: "plan", label: "Plan", href: `/plan?outlet=${outlet.slug}` },
    { key: "waste", label: "Waste log", href: `/waste?outlet=${outlet.slug}` },
  ];

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-[26px]">{outlet.name} · live</h1>
        <span className="muted text-[12.5px]">
          {seated != null ? `${seated} seated` : ""}
          {f ? ` · ${f.covers_p50} forecast` : ""}
        </span>
      </div>
      <Tabs items={tabs} current="live" />
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

      {mayWrite(ctx, "waste_logs") ? <VoiceLogger propertyId={ctx.property.id} outletId={outlet.id} serviceDate={date} department="kitchen" placeholder="Log a station, in English or Chinese" examples={["Western hot over-prep 2 kg", "142 seated", "eggs ready"]} /> : null}

      <div className="mt-5">
        {(events ?? []).length === 0 ? (
          <Empty>{f ? "Service is quiet: pace on forecast, no station running fast." : "No plan for this service yet."}</Empty>
        ) : (
          (events ?? []).map((e) => (
            <div key={e.id} className="card mb-2.5 px-4 py-3.5">
              <div className="flex items-baseline gap-3">
                <span className="muted num text-[12px]">{hhmm(e.at, ctx.property.timezone)}</span>
                <span className={`text-[11px] uppercase tracking-[0.14em] ${e.kind === "waste_risk" ? "text-amber" : e.kind === "running_fast" ? "text-gold-light" : "text-mist"}`}>{e.kind.replace("_", " ")}</span>
              </div>
              <div className="mt-1 text-[16px] font-medium">{e.title}</div>
              {e.body ? <p className="muted mt-0.5 text-[13.5px]">{e.body}</p> : null}
              {e.status === "open" && e.proposal && mayWrite(ctx, "live_events") ? (
                <div className="mt-3 flex gap-2">
                  <ActionButton small action={actOnLiveEvent.bind(null, e.id, "approved")} label="Approve" done="Approved" />
                  <ActionButton small variant="ghost" action={actOnLiveEvent.bind(null, e.id, "dismissed")} label="Not now" done="Dismissed" />
                </div>
              ) : e.status === "approved" ? (
                <span className="pill pill-gn mt-3">Approved</span>
              ) : e.status === "dismissed" ? (
                <span className="pill pill-mt mt-3">Dismissed</span>
              ) : null}
            </div>
          ))
        )}
      </div>

      {groups.length ? (
        <>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Stations</h2>
            <span className="muted text-[12.5px]">tick off as you go</span>
          </div>
          <Card>
            {groups.map((g) => (
              <div key={g.station.id} className="row">
                <div className="t min-w-0">
                  <b>{g.station.name}</b>
                  <span>
                    {g.lines.map((l) => `${timeShort(l.waves?.starts_at ?? "")} ${num(l.qty, g.station.unit === "L" ? 1 : 0)}`).join(" · ")} {g.station.unit !== "portions" ? g.station.unit : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {g.status === "closed" || !mayWrite(ctx, "plans") ? (
                    <span className={`pill ${g.status === "prepped" ? "pill-gn" : g.status === "running_low" ? "pill-am" : "pill-mt"}`}>{g.status.replace("_", " ")}</span>
                  ) : g.status === "running_low" ? (
                    <>
                      <span className="pill pill-am">running low</span>
                      <ActionButton small variant="ghost" action={async () => { "use server"; for (const l of g.lines) await setStationStatus(l.id, "prepped"); return { ok: true as const, label: "Topped up" }; }} label="Topped up" done="Topped up" />
                    </>
                  ) : (
                    <>
                      {g.status !== "prepped" ? <ActionButton small action={async () => { "use server"; for (const l of g.lines) await setStationStatus(l.id, "prepped"); return { ok: true as const, label: "Prepped" }; }} label="Prepped" done="Prepped" /> : <span className="pill pill-gn">prepped</span>}
                      <ActionButton small variant="ghost" action={async () => { "use server"; for (const l of g.lines) await setStationStatus(l.id, "running_low"); return { ok: true as const, label: "Flagged" }; }} label="Low" done="Flagged" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}
