import { SettingsNav } from "./nav";
import { Check, Field, SaveForm } from "@/components/form-button";
import { ScreenHead } from "@/components/ui";
import { saveProperty } from "@/lib/actions/settings";
import { can, getContext } from "@/lib/data/context";

export const metadata = { title: "Set-up" };

export default async function SettingsPage() {
  const ctx = await getContext();
  const s = (ctx.property.settings ?? {}) as Record<string, string | number | boolean>;
  const editable = can(ctx, "gm");
  return (
    <>
      <ScreenHead hi={<>Set-up</>} sub={`${ctx.property.name} · configuration without code`} />
      <SettingsNav current="hotel" />
      {!editable ? <p className="muted mb-4 text-[13px]">Only the general manager changes these settings.</p> : null}
      <SaveForm action={saveProperty.bind(null, ctx.property.id)} className="card px-4 py-4">
        <fieldset disabled={!editable} className="grid grid-cols-2 gap-3">
          <Field label="Hotel name" name="name" defaultValue={ctx.property.name} required />
          <Field label="Rooms (keys)" name="keys" type="number" defaultValue={ctx.property.keys} />
          <Field label="Currency" name="currency" defaultValue={ctx.property.currency} help="ISO code: USD, HKD, TWD…" />
          <Field label="Time zone" name="timezone" defaultValue={ctx.property.timezone} help="Asia/Hong_Kong, Asia/Taipei…" />
          <Field label="Food cost per cover" name="food_cost_per_cover" type="number" step="0.01" defaultValue={s.food_cost_per_cover as number} help="in the hotel's currency" />
          <Field label="Waste baseline, g per cover" name="waste_baseline_g_cover" type="number" step="1" defaultValue={s.waste_baseline_g_cover as number} help="measured before ServiceFlow; leave empty to use the trailing average" />
          <Field label="CO₂e per kg, default" name="co2e_default_factor" type="number" step="0.1" defaultValue={(s.co2e_default_factor as number) ?? 2.5} help="when a station has no category factor" />
          <Field label="Energy baseline, kWh per key-night" name="energy_baseline_kwh_room" type="number" step="0.1" defaultValue={s.energy_baseline_kwh_room as number} />
          <Field label="Evening brief at" name="brief_time" type="time" defaultValue={(s.brief_time as string) ?? "18:00"} />
          <Field label="Dawn update at" name="dawn_update_time" type="time" defaultValue={(s.dawn_update_time as string) ?? "03:30"} />
          <Field label="Debrief at" name="debrief_time" type="time" defaultValue={(s.debrief_time as string) ?? "12:30"} />
          <Field label="Saving points, total / ServiceFlow" name="saving_points_total" type="number" step="1" defaultValue={(s.saving_points_total as number) ?? 4} help="4 points of food cost in all; 3 are the forecast's" />
          <input type="hidden" name="saving_points_serviceflow" value={(s.saving_points_serviceflow as number) ?? 3} />
          <div className="col-span-2 pt-1">
            <Check label="A bin scale (Winnow or similar) is in place: its reactive point is credited to the scale, never to ServiceFlow" name="winnow" defaultChecked={!!s.winnow} />
          </div>
        </fieldset>
      </SaveForm>
    </>
  );
}
