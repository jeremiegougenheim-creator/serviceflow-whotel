import { SettingsNav } from "../nav";
import { ActionButton } from "@/components/action-button";
import { Check, Field, SaveForm } from "@/components/form-button";
import { ScreenHead } from "@/components/ui";
import { deleteStation, saveOutlet, saveStation, saveWave } from "@/lib/actions/settings";
import { can, getContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Outlets" };

const TYPES: [string, string][] = [["breakfast", "Breakfast buffet"], ["restaurant", "Restaurant, à la carte"], ["bar", "Bar"], ["banquet", "Banquets"], ["room_service", "Room service"], ["other", "Other"]];
const KINDS: [string, string][] = [["buffet", "Buffet station"], ["dish", "À la carte dish"], ["batch", "Batch"], ["course", "Banquet course"]];
const CATS: [string, string][] = [["default", "Default"], ["bread_pastry", "Bread & pastry"], ["meat", "Meat"], ["dairy", "Dairy & eggs"], ["vegetables", "Vegetables"], ["seafood", "Seafood"], ["rice_noodles", "Rice & noodles"], ["fruit", "Fruit"], ["beverage", "Beverage"]];

export default async function OutletsSettings({ searchParams }: { searchParams: Promise<{ outlet?: string; station?: string; add?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: outlets }, { data: stations }, { data: waves }] = await Promise.all([
    supabase.from("outlets").select("*").eq("property_id", ctx.property.id).order("sort_order"),
    supabase.from("stations").select("*").eq("property_id", ctx.property.id).eq("active", true).order("sort_order"),
    supabase.from("waves").select("*").eq("property_id", ctx.property.id).order("sort_order"),
  ]);
  const editable = can(ctx, "gm", "fnb_mgr", "chef");
  const current = (outlets ?? []).find((o) => o.slug === sp.outlet) ?? outlets?.[0] ?? null;
  const editing = sp.station ? (stations ?? []).find((s) => s.id === sp.station) ?? null : null;
  const set = (editing?.settings ?? {}) as { aliases?: string[] };
  const priors = (editing?.nationality_priors ?? {}) as Record<string, { mult: number }>;
  const dow = (editing?.dow_profile ?? {}) as Record<string, number>;
  const wx = (editing?.weather_profile ?? {}) as Record<string, number>;

  return (
    <>
      <ScreenHead hi={<>Outlets & stations</>} sub="What the plan is written for" />
      <SettingsNav current="outlets" />
      <div className="scroll-x -mx-4 mb-4 px-4">
        <div className="tabs">
          {(outlets ?? []).map((o) => (
            <a key={o.id} href={`/settings/outlets?outlet=${o.slug}`} className={o.id === current?.id ? "on" : ""}>
              {o.name}
            </a>
          ))}
          {editable ? <a href="/settings/outlets?add=outlet" className={sp.add === "outlet" ? "on" : ""}>+ Outlet</a> : null}
        </div>
      </div>

      {sp.add === "outlet" || !current ? (
        <SaveForm action={saveOutlet.bind(null, ctx.property.id, null)} className="card px-4 py-4" label="Add the outlet">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" name="name" required placeholder="Breakfast" />
            <Field label="Type" name="outlet_type" options={TYPES} />
            <Field label="Opens" name="opens_at" type="time" defaultValue="06:30" />
            <Field label="Closes" name="closes_at" type="time" defaultValue="10:30" />
            <Field label="Seats" name="capacity_pax" type="number" />
            <Field label="Usual covers" name="usual_covers" type="number" help="the habit, before any forecast" />
          </div>
        </SaveForm>
      ) : (
        <>
          <SaveForm action={saveOutlet.bind(null, ctx.property.id, current.id)} className="card px-4 py-4">
            <fieldset disabled={!editable} className="grid grid-cols-2 gap-3">
              <Field label="Name" name="name" defaultValue={current.name} required />
              <Field label="Type" name="outlet_type" options={TYPES} defaultValue={current.outlet_type} />
              <Field label="Opens" name="opens_at" type="time" defaultValue={current.opens_at.slice(0, 5)} />
              <Field label="Closes" name="closes_at" type="time" defaultValue={current.closes_at.slice(0, 5)} />
              <Field label="Seats" name="capacity_pax" type="number" defaultValue={current.capacity_pax} />
              <Field label="Usual covers" name="usual_covers" type="number" defaultValue={(current.settings as { usual_covers?: number })?.usual_covers} />
              <Field label="Walk-in share" name="walk_in_share" type="number" step="0.01" defaultValue={(current.settings as { walk_in_share?: number })?.walk_in_share} help="à la carte: 0.12 = 12% of covers" />
              <Field label="Banquet buffer" name="buffer_pct" type="number" step="0.01" defaultValue={(current.settings as { buffer_pct?: number })?.buffer_pct} help="0.03 = cook 3% above confirmed" />
              <Field label="Order" name="sort_order" type="number" defaultValue={current.sort_order} />
            </fieldset>
          </SaveForm>

          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Waves</h2>
            <span className="muted text-[12.5px]">when guests arrive</span>
          </div>
          <div className="grid gap-2">
            {(waves ?? []).filter((w) => w.outlet_id === current.id).map((w) => (
              <SaveForm key={w.id} action={saveWave.bind(null, ctx.property.id, current.id, w.id)} className="card px-4 py-3" label="Save">
                <fieldset disabled={!editable} className="grid grid-cols-4 gap-2">
                  <Field label="Label" name="label" defaultValue={w.label} />
                  <Field label="Starts" name="starts_at" type="time" defaultValue={w.starts_at.slice(0, 5)} />
                  <Field label="Default share" name="share_default" type="number" step="0.01" defaultValue={Number(w.share_default)} />
                  <Field label="Order" name="sort_order" type="number" defaultValue={w.sort_order} />
                </fieldset>
              </SaveForm>
            ))}
            {editable ? (
              <SaveForm action={saveWave.bind(null, ctx.property.id, current.id, null)} className="card px-4 py-3" label="Add a wave">
                <div className="grid grid-cols-4 gap-2">
                  <Field label="Label" name="label" placeholder="09:30" />
                  <Field label="Starts" name="starts_at" type="time" />
                  <Field label="Default share" name="share_default" type="number" step="0.01" defaultValue={0.3} />
                  <Field label="Order" name="sort_order" type="number" defaultValue={(waves ?? []).filter((w) => w.outlet_id === current.id).length + 1} />
                </div>
              </SaveForm>
            ) : null}
          </div>

          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Stations</h2>
            <span className="muted text-[12.5px]">the unit of the plan</span>
          </div>
          <div className="card px-4 py-1">
            {(stations ?? []).filter((s) => s.outlet_id === current.id).map((s) => (
              <div key={s.id} className="row">
                <div className="t min-w-0">
                  <b>{s.name}</b>
                  <span>
                    {s.station_kind} · {s.food_category.replace("_", " ")} · par {Number(s.base_par)} {s.unit} · {Number(s.cost_per_unit)} per {s.unit.replace(/s$/, "")} · {Number(s.kg_per_unit)} kg
                  </span>
                </div>
                {editable ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <a href={`/settings/outlets?outlet=${current.slug}&station=${s.id}`} className="btn btn-ghost !px-3 !py-2 !text-[12.5px]">
                      Edit
                    </a>
                    <ActionButton small variant="ghost" action={deleteStation.bind(null, s.id)} label="Remove" done="Removed" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {editable ? (
            <SaveForm key={editing?.id ?? "new"} action={saveStation.bind(null, ctx.property.id, current.id, editing?.id ?? null)} className="card mt-3 px-4 py-4" label={editing ? "Save the station" : "Add a station"}>
              <div className="eyebrow mb-3">{editing ? `Editing ${editing.name}` : "New station"}</div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Name" name="name" defaultValue={editing?.name} required placeholder="Western hot" />
                <Field label="Kind" name="station_kind" options={KINDS} defaultValue={editing?.station_kind} />
                <Field label="Food category" name="food_category" options={CATS} defaultValue={editing?.food_category} />
                <Field label="Unit" name="unit" defaultValue={editing?.unit ?? "portions"} help="portions, kg, L, plates, trays" />
                <Field label="Usual par" name="base_par" type="number" step="0.1" defaultValue={editing ? Number(editing.base_par) : undefined} help="at the usual covers" />
                <Field label="Usual covers" name="usual_covers" type="number" defaultValue={editing?.usual_covers == null ? undefined : Number(editing.usual_covers)} help="leave empty to use the outlet's" />
                <Field label="Cost per unit" name="cost_per_unit" type="number" step="0.01" defaultValue={editing ? Number(editing.cost_per_unit) : undefined} />
                <Field label="Kg per unit" name="kg_per_unit" type="number" step="0.01" defaultValue={editing ? Number(editing.kg_per_unit) : 0.25} />
                <Field label="CO₂e per kg" name="co2e_factor" type="number" step="0.1" defaultValue={editing?.co2e_factor == null ? undefined : Number(editing.co2e_factor)} help="empty = category factor" />
                <Field label="Greater China ×" name="prior_greater_china" type="number" step="0.05" defaultValue={priors.greater_china?.mult ?? 1} />
                <Field label="Japan ×" name="prior_japan" type="number" step="0.05" defaultValue={priors.japan?.mult ?? 1} />
                <Field label="Korea ×" name="prior_korea" type="number" step="0.05" defaultValue={priors.korea?.mult ?? 1} />
                <Field label="Western ×" name="prior_western" type="number" step="0.05" defaultValue={priors.western?.mult ?? 1} />
                <Field label="Weekend ×" name="weekend" type="number" step="0.05" defaultValue={dow.weekend ?? 1} />
                <Field label="Rain ×" name="rain" type="number" step="0.05" defaultValue={wx.rain ?? 1} />
                <Field label="Hot day ×" name="hot" type="number" step="0.05" defaultValue={wx.hot ?? 1} />
                <Field label="Voice aliases" name="aliases" defaultValue={set.aliases?.join(", ")} help="other names, incl. Chinese: 西式热食, hot line" />
                <Field label="Order" name="sort_order" type="number" defaultValue={editing?.sort_order ?? (stations ?? []).filter((s) => s.outlet_id === current.id).length + 1} />
                <div className="pt-6">
                  <Check label="High-value dish" name="high_value" defaultChecked={editing?.high_value} />
                </div>
              </div>
            </SaveForm>
          ) : null}
        </>
      )}
    </>
  );
}
