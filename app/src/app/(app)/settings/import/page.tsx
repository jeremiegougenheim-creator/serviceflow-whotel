import { SettingsNav } from "../nav";
import { ImportForm } from "./import-form";
import { Card, Note, Row, ScreenHead } from "@/components/ui";
import { TEMPLATES, type ImportKind } from "@/lib/csv";
import { can, getContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Imports" };

const LABELS: Record<ImportKind, string> = { pms_daily: "PMS history (occupancy and guest mix)", service_actuals: "Covers served", waste_logs: "Waste history", roster_shifts: "Roster", property_financials: "Monthly P&L", energy_readings: "Energy meter", rooms: "Room inventory", bookings_daily: "Reservations" };

export default async function ImportPage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data: imports } = await supabase.from("imports").select("*").eq("property_id", ctx.property.id).order("created_at", { ascending: false }).limit(10);
  const editable = can(ctx, "gm", "fnb_mgr", "chef", "hk", "eng");
  return (
    <>
      <ScreenHead hi={<>Imports</>} sub="CSV exports from the PMS, the POS, the bin scale, the meter" />
      <SettingsNav current="import" />
      {editable ? <ImportForm propertyId={ctx.property.id} kinds={(Object.keys(TEMPLATES) as ImportKind[]).map((k) => [k, LABELS[k]])} /> : <Note>Only managers import files.</Note>}
      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">Templates</h2>
        <span className="muted text-[12.5px]">header row, then one row per record</span>
      </div>
      <div className="grid gap-2">
        {(Object.keys(TEMPLATES) as ImportKind[]).map((k) => (
          <details key={k} className="card px-4 py-3">
            <summary className="cursor-pointer text-[14.5px] font-medium">{LABELS[k]} <span className="muted text-[12px]">({k})</span></summary>
            <p className="muted mt-2 text-[12.5px]">{TEMPLATES[k].note}</p>
            <code className="mt-2 block overflow-x-auto rounded-lg bg-ink/60 p-2 text-[11.5px] text-gold-light">{[...TEMPLATES[k].required, ...TEMPLATES[k].optional].join(",")}</code>
          </details>
        ))}
      </div>
      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">Recent imports</h2>
      </div>
      <Card>
        {(imports ?? []).map((i) => (
          <Row key={i.id} title={`${LABELS[i.kind as ImportKind] ?? i.kind} · ${i.file_name ?? ""}`} note={`${i.rows_ok} rows${i.rows_failed ? ` · ${i.rows_failed} failed` : ""} · ${new Date(i.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ctx.property.timezone })}`} pill={i.status} tone={i.status === "done" ? "gn" : "rd"} />
        ))}
        {!(imports ?? []).length ? <Row title="No import yet." /> : null}
      </Card>
    </>
  );
}
