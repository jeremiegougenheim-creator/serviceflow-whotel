import { SettingsNav } from "../nav";
import { ActionButton } from "@/components/action-button";
import { Check, Field, SaveForm } from "@/components/form-button";
import { Card, Note, Row, ScreenHead } from "@/components/ui";
import { inviteMember, removeMember, saveTeamMember } from "@/lib/actions/settings";
import { can, getContext } from "@/lib/data/context";
import { ROLE_TAG } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Team" };

const DEPTS: [string, string][] = [["kitchen", "Kitchen"], ["service", "Service"], ["stewarding", "Stewarding"], ["bar", "Bar"], ["housekeeping", "Housekeeping"], ["engineering", "Engineering"], ["front_office", "Front office"], ["management", "Management"]];
const ROLES: [string, string][] = [["gm", "General manager"], ["fnb_mgr", "F&B manager"], ["chef", "Chef"], ["sous_chef", "Sous chef"], ["prep_cook", "Prep cook"], ["hk", "Housekeeping"], ["eng", "Engineering"], ["auditor", "Auditor (read-only)"], ["owner", "Owner (read-only)"], ["admin", "Admin"]];

export default async function TeamSettings({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: members }, { data: apps }, { data: org }] = await Promise.all([
    supabase.from("team_members").select("*").eq("property_id", ctx.property.id).eq("active", true).order("department").order("name"),
    supabase.from("memberships").select("id, role, invited_email, user_id, users(email, full_name)").eq("property_id", ctx.property.id).eq("active", true),
    supabase.from("properties").select("org_id").eq("id", ctx.property.id).single(),
  ]);
  const editable = can(ctx, "gm", "fnb_mgr", "chef", "hk", "eng");
  const editing = sp.member ? (members ?? []).find((m) => m.id === sp.member) ?? null : null;
  const grouped = new Map<string, NonNullable<typeof members>>();
  for (const m of members ?? []) grouped.set(m.department, [...(grouped.get(m.department) ?? []), m]);

  return (
    <>
      <ScreenHead hi={<>Team</>} sub="Who is on the rota, and who signs in" />
      <SettingsNav current="team" />

      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[20px]">App access</h2>
        <span className="muted text-[12.5px]">{(apps ?? []).length} people</span>
      </div>
      <Card>
        {(apps ?? []).map((a) => {
          const u = a.users as { email: string; full_name: string | null } | null;
          return (
            <div key={a.id} className="row">
              <div className="t min-w-0">
                <b>{u?.full_name ?? u?.email ?? a.invited_email}</b>
                <span>
                  {ROLE_TAG[a.role]} {!a.user_id ? "· invited, not signed in yet" : ""}
                </span>
              </div>
              {can(ctx, "gm") ? <ActionButton small variant="ghost" action={removeMember.bind(null, a.id)} label="Remove" done="Removed" /> : null}
            </div>
          );
        })}
      </Card>
      {can(ctx, "gm") && org ? (
        <SaveForm action={inviteMember.bind(null, ctx.property.id, org.org_id)} className="card mt-3 px-4 py-4" label="Invite">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" name="email" type="email" required placeholder="chef@hotel.com" />
            <Field label="Role" name="role" options={ROLES} defaultValue="chef" />
          </div>
        </SaveForm>
      ) : null}

      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">Rota</h2>
        <span className="muted text-[12.5px]">{(members ?? []).length} on the team</span>
      </div>
      {[...grouped.entries()].map(([dept, list]) => (
        <div key={dept} className="mb-3">
          <div className="eyebrow mb-1">{DEPTS.find((d) => d[0] === dept)?.[1] ?? dept}</div>
          <Card>
            {list.map((m) => (
              <Row key={m.id} title={m.name} note={`${m.role}${m.pool ? " · pool" : ""}${m.phone ? " · " + m.phone : ""}`} href={editable ? `/settings/team?member=${m.id}` : undefined} />
            ))}
          </Card>
        </div>
      ))}
      {editable ? (
        <SaveForm key={editing?.id ?? "new"} action={saveTeamMember.bind(null, ctx.property.id, editing?.id ?? null)} className="card px-4 py-4" label={editing ? "Save" : "Add to the team"}>
          <div className="eyebrow mb-3">{editing ? `Editing ${editing.name}` : "New team member"}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Name" name="name" defaultValue={editing?.name} required />
            <Field label="Department" name="department" options={DEPTS} defaultValue={editing?.department} />
            <Field label="Role" name="role" defaultValue={editing?.role ?? "cook"} placeholder="cook, steward, attendant…" />
            <Field label="Phone" name="phone" defaultValue={editing?.phone} />
            <Field label="Email" name="email" type="email" defaultValue={editing?.email} />
            <Field label="Hourly cost" name="hourly_cost" type="number" step="0.01" defaultValue={editing?.hourly_cost == null ? undefined : Number(editing.hourly_cost)} />
            <div className="pt-6">
              <Check label="Pool (casual)" name="pool" defaultChecked={editing?.pool} />
            </div>
          </div>
        </SaveForm>
      ) : null}
      <Note>Nobody on the rota needs a login. Only the people who approve, log or read the brief sign in.</Note>
    </>
  );
}
