import Link from "next/link";
import type { ReactNode } from "react";

export function ScreenHead({ hi, sub, eyebrow }: { hi?: ReactNode; sub?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
      {hi ? <h1 className="text-[30px] leading-[1.1] md:text-[36px]">{hi}</h1> : null}
      {sub ? <p className="muted mt-1.5 text-[14px]">{sub}</p> : null}
    </div>
  );
}

export function Kpi({ k, v, n, tone }: { k: ReactNode; v: ReactNode; n?: ReactNode; tone?: "gn" | "am" | "rd" }) {
  const color = tone === "gn" ? "text-green" : tone === "am" ? "text-amber" : tone === "rd" ? "text-red" : "";
  return (
    <div className="card px-4 py-3.5">
      <div className="kpi-k">{k}</div>
      <div className={`kpi-v mt-1.5 ${color}`}>{v}</div>
      {n ? <div className="muted mt-1 text-[12.5px]">{n}</div> : null}
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 4 ? "grid-cols-2 md:grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return <div className={`grid gap-2.5 ${c}`}>{children}</div>;
}

export function SectionHead({ title, note }: { title: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-1 mt-6 flex items-baseline justify-between">
      <h2 className="text-[20px]">{title}</h2>
      {note ? <span className="muted text-[12.5px]">{note}</span> : null}
    </div>
  );
}

export function Row({ title, note, right, pill, tone, href }: { title: ReactNode; note?: ReactNode; right?: ReactNode; pill?: ReactNode; tone?: "gn" | "am" | "rd" | "mt" | "gd"; href?: string }) {
  const inner = (
    <>
      <div className="t min-w-0">
        <b className="break-words">{title}</b>
        {note ? <span>{note}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {right != null ? <div className="q">{right}</div> : null}
        {pill != null ? <span className={`pill pill-${tone ?? "mt"}`}>{pill}</span> : null}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="row hover:bg-navy-mid/40">
      {inner}
    </Link>
  ) : (
    <div className="row">{inner}</div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card px-4 py-1 ${className}`}>{children}</div>;
}

export function Tabs({ items, current }: { items: { label: string; href: string; key: string }[]; current: string }) {
  return (
    <div className="scroll-x -mx-4 mb-4 px-4">
      <div className="tabs">
        {items.map((t) => (
          <Link key={t.key} href={t.href} className={t.key === current ? "on" : ""} aria-current={t.key === current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Strike({ eyebrow, title, body, tiles, action }: { eyebrow: ReactNode; title: ReactNode; body?: ReactNode; tiles?: { b: ReactNode; s: ReactNode }[]; action?: ReactNode }) {
  return (
    <div className="strike">
      <div className="eyebrow">{eyebrow}</div>
      <div className="tt">{title}</div>
      {body ? <p className="muted mt-2 text-[14px]">{body}</p> : null}
      {tiles?.length ? (
        <div className="tiles">
          {tiles.map((t, i) => (
            <div key={i} className="tile">
              <b>{t.b}</b>
              <span>{t.s}</span>
            </div>
          ))}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="muted mt-4 text-[13px] leading-relaxed">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card px-4 py-6 text-center text-[14px] text-mist">{children}</div>;
}
