import { ActionButton, ActionGroup } from "@/components/action-button";
import { Chip } from "@/components/ui";
import { approveDecision, rejectDecision, revertDecision } from "@/lib/actions/ops";
import { mayWrite, type AppContext } from "@/lib/data/context";
import { money, typo } from "@/lib/format";
import { undoable } from "@/lib/status";
import type { Tables } from "@/lib/supabase/database.types";

type Decision = Tables<"decisions">;

/**
 * One decision, in place. Waiting: "Keep as is" and "Approve", locked together. Decided: the
 * status with its time ("Approved 18:42") and, for ten minutes, an Undo for the person who
 * decided. The row never leaves the list, so the next one never slides under a thumb.
 */
export function DecisionRow({ d, ctx, linked }: { d: Decision; ctx: AppContext; linked?: { status: string; title: string } | null }) {
  const suggestionId = (d.payload as { suggestion_id?: string } | null)?.suggestion_id;
  const waiting = d.status === "proposed" && (!linked || linked.status === "proposed");
  const canDecide = mayWrite(ctx, "decisions");
  const saving = Number(d.est_saving) >= 10 ? money(d.est_saving, d.currency ?? ctx.property.currency) : null;
  const title = linked?.title ?? typo(d.title);

  return (
    <div className="row row-decision">
      <div className="t min-w-0">
        <b>
          {title}
          {saving ? <small className="ml-2 whitespace-nowrap text-[13px] font-normal text-green">{saving}</small> : null}
        </b>
        <span>{d.detail ?? d.reason}</span>
      </div>
      {waiting && canDecide ? (
        <ActionGroup className="acts">
          <ActionButton small variant="ghost" actionKey={`${d.id}:keep`} action={rejectDecision.bind(null, d.id)} label="Keep as is" done="Kept as is" />
          <ActionButton small actionKey={`${d.id}:approve`} action={approveDecision.bind(null, d.id)} label={suggestionId ? "Apply to roster" : "Approve"} done={suggestionId ? "Applied" : "Approved"} />
        </ActionGroup>
      ) : linked && linked.status !== "proposed" ? (
        <span className={`pill ${linked.status === "applied" ? "pill-gn" : "pill-mt"}`}>{linked.status === "applied" ? "Applied on the roster" : "Set aside on the roster"}</span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Chip entity="decision" status={d.status} at={d.decided_at} tz={ctx.property.timezone} />
          {d.decided_by === ctx.userId && undoable(d.decided_at) && !suggestionId && d.status !== "proposed" ? (
            <ActionButton small variant="ghost" actionKey={`${d.id}:undo:${d.decided_at}`} action={revertDecision.bind(null, d.id)} label="Undo" done="Undone" />
          ) : null}
        </div>
      )}
    </div>
  );
}
