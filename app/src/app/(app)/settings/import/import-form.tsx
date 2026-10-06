"use client";

import { useActionState, useState } from "react";
import { importCsv } from "@/lib/actions/import";
import type { ImportKind } from "@/lib/csv";

export function ImportForm({ propertyId, kinds }: { propertyId: string; kinds: [ImportKind, string][] }) {
  const [kind, setKind] = useState<ImportKind>(kinds[0][0]);
  const [state, action, pending] = useActionState(async (_p: unknown, fd: FormData) => importCsv(propertyId, kind, fd), null);
  return (
    <form action={action} className="card px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="lbl" htmlFor="kind">What</label>
          <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as ImportKind)}>
            {kinds.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="file">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" required />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className="btn btn-gold" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </button>
        {state ? <span className={`text-[13px] ${state.ok ? "text-green" : "text-red"}`}>{state.ok ? state.label : state.error}</span> : null}
      </div>
    </form>
  );
}
