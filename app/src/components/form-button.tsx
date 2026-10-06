"use client";

import { useActionState } from "react";

type Result = { ok: true; label?: string } | { ok: false; error: string };

/** A form whose server action takes the FormData; shows the result inline. */
export function SaveForm({ action, children, label = "Save", className = "" }: { action: (formData: FormData) => Promise<Result>; children: React.ReactNode; label?: string; className?: string }) {
  const [state, formAction, pending] = useActionState(async (_prev: Result | null, fd: FormData) => action(fd), null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className="btn btn-gold" disabled={pending}>
          {pending ? "…" : label}
        </button>
        {state ? <span className={`text-[13px] ${state.ok ? "text-green" : "text-red"}`}>{state.ok ? state.label ?? "Saved" : state.error}</span> : null}
      </div>
    </form>
  );
}

export function Field({ label, name, type = "text", defaultValue, step, placeholder, required, options, help }: { label: string; name: string; type?: string; defaultValue?: string | number | null; step?: string; placeholder?: string; required?: boolean; options?: [string, string][]; help?: string }) {
  return (
    <div>
      <label className="lbl" htmlFor={name}>{label}</label>
      {options ? (
        <select id={name} name={name} className="input" defaultValue={defaultValue ?? undefined}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : (
        <input id={name} name={name} type={type} className="input" defaultValue={defaultValue ?? undefined} step={step} placeholder={placeholder} required={required} />
      )}
      {help ? <p className="muted mt-1 text-[11.5px]">{help}</p> : null}
    </div>
  );
}

export function Check({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[14px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-[#b8894a]" />
      {label}
    </label>
  );
}
