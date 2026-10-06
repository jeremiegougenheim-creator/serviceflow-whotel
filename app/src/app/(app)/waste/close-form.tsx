"use client";

import { useActionState, useState } from "react";
import { closeService } from "@/lib/actions/ops";

export function CloseServiceForm({ propertyId, outletId, serviceDate, suggested }: { propertyId: string; outletId: string; serviceDate: string; suggested: number | null }) {
  const [covers, setCovers] = useState(suggested ? String(suggested) : "");
  const [state, action, pending] = useActionState(async () => closeService({ propertyId, outletId, serviceDate, actualCovers: Number(covers) }), null);
  if (state?.ok) return <div className="btn btn-done">Service closed · {covers} covers</div>;
  return (
    <form action={action} className="card-raised flex items-end gap-3 px-4 py-3.5">
      <div className="flex-1">
        <label className="lbl" htmlFor="covers">Close the service · covers served</label>
        <input id="covers" className="input" inputMode="numeric" value={covers} onChange={(e) => setCovers(e.target.value.replace(/[^\d]/g, ""))} placeholder="from the POS" required />
      </div>
      <button type="submit" className="btn btn-gold" disabled={pending || !covers}>
        {pending ? "…" : "Close"}
      </button>
      {state && !state.ok ? <span className="text-[12px] text-red">{state.error}</span> : null}
    </form>
  );
}
