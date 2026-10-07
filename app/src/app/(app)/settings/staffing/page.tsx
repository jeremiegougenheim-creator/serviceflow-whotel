import { SettingsNav } from "../nav";
import { Field, SaveForm } from "@/components/form-button";
import { Note, ScreenHead } from "@/components/ui";
import { saveServiceLine } from "@/lib/actions/settings";
import { can, getContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Staffing set-up" };

const DEPTS: [string, string][] = [["kitchen", "Kitchen"], ["service", "Service"], ["stewarding", "Stewarding"], ["bar", "Bar"], ["housekeeping", "Housekeeping"], ["engineering", "Engineering"], ["front_office", "Front office"], ["management", "Management"]];

export default async function StaffingSettings() {
  const ctx = await getContext();
  const supabase = await createClient();
  const [{ data: lines }, { data: outlets }] = await Promise.all([
    supabase.from("service_lines").select("*").eq("property_id", ctx.property.id).order("sort_order"),
    supabase.from("outlets").select("id, name").eq("property_id", ctx.property.id).order("sort_order"),
  ]);
  const editable = can(ctx, "gm", "fnb_mgr", "chef", "hk", "eng");
  const outletOptions: [string, string][] = [["", "Whole hotel"], ...(outlets ?? []).map((o) => [o.id, o.name] as [string, string])];
  const form = (l: NonNullable<typeof lines>[number] | null) => (
    <fieldset disabled={!editable} className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Field label="Name" name="name" defaultValue={l?.name} required placeholder="Kitchen, early shift" />
      <Field label="Department" name="department" options={DEPTS} defaultValue={l?.department} />
      <Field label="Outlet" name="outlet_id" options={outletOptions} defaultValue={l?.outlet_id ?? ""} />
      <Field label="Shift" name="shift_label" defaultValue={l?.shift_label} placeholder="early" />
      <Field label="Starts" name="starts_at" type="time" defaultValue={l?.starts_at?.slice(0, 5)} />
      <Field label="Ends" name="ends_at" type="time" defaultValue={l?.ends_at?.slice(0, 5)} />
      <Field label="Hours per cover" name="hours_per_cover" type="number" step="0.005" defaultValue={l?.hours_per_cover == null ? undefined : Number(l.hours_per_cover)} help="F&B lines" />
      <Field label="Minutes per room" name="minutes_per_room" type="number" step="1" defaultValue={l?.minutes_per_room == null ? undefined : Number(l.minutes_per_room)} help="housekeeping" />
      <Field label="Fixed hours" name="fixed_hours" type="number" step="0.5" defaultValue={l ? Number(l.fixed_hours) : 0} help="needed whatever the volume" />
      <Field label="Minimum hours" name="min_hours" type="number" step="0.5" defaultValue={l ? Number(l.min_hours) : 0} />
      <Field label="Order" name="sort_order" type="number" defaultValue={l?.sort_order ?? (lines?.length ?? 0) + 1} />
    </fieldset>
  );
  return (
    <>
      <ScreenHead hi={<>Staffing</>} sub="Service lines and the hours each cover or room asks for" />
      <SettingsNav current="staffing" />
      <div className="grid gap-3">
        {(lines ?? []).map((l) => (
          <SaveForm key={l.id} action={saveServiceLine.bind(null, ctx.property.id, l.id)} className="card px-4 py-4" label="Save the line" readOnly={!editable} quiet>
            {form(l)}
          </SaveForm>
        ))}
        {editable ? (
          <SaveForm action={saveServiceLine.bind(null, ctx.property.id, null)} className="card px-4 py-4" label="Add a service line">
            <div className="eyebrow mb-3">New service line</div>
            {form(null)}
          </SaveForm>
        ) : null}
      </div>
      <Note>Demand = fixed hours + covers × hours per cover (or rooms × minutes per room). The roster is compared with it every evening.</Note>
    </>
  );
}
