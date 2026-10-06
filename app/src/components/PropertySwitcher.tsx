"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchProperty } from "@/lib/actions/session";

export function PropertySwitcher({ properties, current }: { properties: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="block">
      <span className="lbl">Hotel</span>
      <select
        className="input text-[13px] py-2"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await switchProperty(e.target.value);
            router.refresh();
          })
        }
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
