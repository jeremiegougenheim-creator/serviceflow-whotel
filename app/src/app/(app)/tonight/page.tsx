import { ActionButton } from "@/components/action-button";
import { Card, Empty, Row, ScreenHead } from "@/components/ui";
import { approveDecision, reconcileVariance } from "@/lib/actions/ops";
import { getContext, mayWrite } from "@/lib/data/context";
import { money, plusDays, weekday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tonight" };

type Grade = { grade: string; score: number; note: string };

export default async function TonightPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const date = sp.date ?? ctx.today;
  const tomorrow = plusDays(date, 1);
  const supabase = await createClient();
  const [{ data: report }, { data: actions }, { data: variances }] = await Promise.all([
    supabase.from("nightly_reports").select("*").eq("property_id", ctx.property.id).eq("service_date", date).maybeSingle(),
    supabase.from("decisions").select("*").eq("property_id", ctx.property.id).eq("service_date", tomorrow).in("source", ["nightly", "engine"]).neq("status", "expired").order("est_saving", { ascending: false }).limit(12),
    supabase.from("pos_variances").select("id").eq("property_id", ctx.property.id).eq("status", "open"),
  ]);
  const grades = (report?.grades ?? {}) as Record<"fnb" | "labour" | "leakage" | "esg", Grade>;
  const summary = (report?.summary ?? {}) as { subline?: string };
  const best = report?.best_log as { outlet: string; note: string; score: string } | null;
  // three actions across departments
  const seen = new Set<string>();
  const three = (actions ?? []).filter((a) => a.status === "proposed" || a.status === "approved").filter((a) => (seen.has(a.department) ? false : (seen.add(a.department), true))).slice(0, 3);
  const order: ("fnb" | "labour" | "leakage" | "esg")[] = ["fnb", "labour", "leakage", "esg"];
  const labels = { fnb: "F&B", labour: "Labour", leakage: "Leakage", esg: "ESG" };
  const tone = (g?: Grade) => (!g ? "" : g.grade.startsWith("A") ? "text-green" : g.grade.startsWith("B") ? "text-gold-light" : g.grade.startsWith("C") ? "text-amber" : "text-red");

  return (
    <>
      <ScreenHead hi={<>Tonight, <em>graded.</em></>} sub={summary.subline ?? `${ctx.property.name} · ${date}`} />
      {report ? (
        <div className="grid grid-cols-4 gap-2">
          {order.map((k) => (
            <div key={k} className="card px-2 py-3 text-center" title={grades[k]?.note}>
              <div className={`grade ${tone(grades[k])}`}>{grades[k]?.grade ?? "—"}</div>
              <div className="eyebrow mt-1 text-[9.5px]">{labels[k]}</div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>The report is graded at 23:00 once the services are closed.</Empty>
      )}
      {report ? (
        <ul className="muted mt-3 space-y-1 text-[12.5px]">
          {order.map((k) => (
            <li key={k}>
              <span className="text-cream">{labels[k]}</span> · {grades[k]?.note}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mb-1 mt-6 flex items-baseline justify-between">
        <h2 className="text-[20px]">{weekday(tomorrow)}</h2>
        <span className="muted text-[12.5px]">{three.length} actions</span>
      </div>
      <Card>
        {three.map((a) => (
          <div key={a.id} className="row">
            <div className="t min-w-0">
              <b>{a.title}</b>
              <span>{a.detail ?? a.reason}</span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-display text-[20px] text-green">{Number(a.est_saving) > 0 ? money(a.est_saving, a.currency ?? ctx.property.currency) : ""}</span>
              {a.status === "proposed" && (a.kind === "reconcile" ? mayWrite(ctx, "pos_variances") : mayWrite(ctx, "decisions")) ? (
                a.kind === "reconcile" && variances?.[0] ? (
                  <ActionButton small action={reconcileVariance.bind(null, variances[0].id)} label="Reconcile" done="Reconciled" />
                ) : (
                  <ActionButton small action={approveDecision.bind(null, a.id)} label="Approve" done="Approved" />
                )
              ) : (
                <span className="pill pill-gn">{a.status}</span>
              )}
            </div>
          </div>
        ))}
        {!three.length ? <Row title="No action waiting for tomorrow." /> : null}
      </Card>

      {best ? (
        <>
          <div className="mb-1 mt-6 flex items-baseline justify-between">
            <h2 className="text-[20px]">Best log tonight</h2>
          </div>
          <Card>
            <Row title={best.outlet} note={best.note} right={<span className="text-[22px]">{best.score}</span>} />
          </Card>
        </>
      ) : null}
    </>
  );
}
