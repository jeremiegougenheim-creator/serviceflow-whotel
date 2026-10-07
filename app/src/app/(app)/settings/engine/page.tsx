import { SettingsNav } from "../nav";
import { ActionButton } from "@/components/action-button";
import { Card, Note, Row, ScreenHead } from "@/components/ui";
import { runJobNow } from "@/lib/actions/settings";
import { can, getContext } from "@/lib/data/context";
import { hhmm } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Engine" };

export default async function EnginePage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data: runs } = await supabase.from("job_runs").select("*").eq("property_id", ctx.property.id).order("started_at", { ascending: false }).limit(15);
  const editable = can(ctx, "gm", "fnb_mgr", "chef");
  const s = (ctx.property.settings ?? {}) as Record<string, string>;
  const jobs: ["brief" | "dawn" | "debrief" | "nightly" | "staffing", string, string][] = [
    ["brief", "Build tomorrow's plan now", `runs every day at ${s.brief_time ?? "18:00"}`],
    ["dawn", "Dawn update for today", `runs at ${s.dawn_update_time ?? "03:30"} with the night's arrivals`],
    ["debrief", "Debrief today", `runs at ${s.debrief_time ?? "12:30"} once the service is closed`],
    ["staffing", "Hours against demand", "two weeks ahead, after every brief"],
    ["nightly", "Grade tonight", "runs at 23:00"],
  ];
  return (
    <>
      <ScreenHead hi={<>Engine</>} sub="The plan is rebuilt on a schedule; run a step by hand when the data changed" />
      <SettingsNav current="engine" />
      <Card>
        {jobs.map(([job, label, note]) => (
          <div key={job} className="row">
            <div className="t min-w-0">
              <b>{label}</b>
              <span>{note}</span>
            </div>
            {editable ? <ActionButton small variant="ghost" actionKey={`run:${job}`} action={runJobNow.bind(null, ctx.property.id, job)} label="Run now" done="Done" /> : null}
          </div>
        ))}
      </Card>
      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">Recent runs</h2>
      </div>
      <Card>
        {(runs ?? []).map((r) => (
          <Row key={r.id} title={`${r.job.replace("_", " ")} · ${r.service_date ?? ""}`} note={`${hhmm(r.started_at, ctx.property.timezone)}${r.error ? " · " + r.error : ""}`} pill={r.status} tone={r.status === "ok" ? "gn" : r.status === "failed" ? "rd" : "mt"} />
        ))}
        {!(runs ?? []).length ? <Row title="No run yet." /> : null}
      </Card>
      <Note>Every forecast keeps its version; approvals made on a previous version stay. The service role runs the engine on the server and never reaches a browser.</Note>
    </>
  );
}
