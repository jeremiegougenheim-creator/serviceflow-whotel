import Link from "next/link";
import type { ReactNode } from "react";

export interface Col<T> {
  key: string;
  label: string;
  /** right-aligned, tabular figures */
  num?: boolean;
  /** the value the column sorts on; a column without one cannot be sorted */
  sort?: (r: T) => number | string | null | undefined;
  cell: (r: T) => ReactNode;
  /** a second line under the header label */
  hint?: string;
}

/** Sorts rows on a column; empty values always go last, whichever the direction. */
export function sortRows<T>(rows: T[], cols: Col<T>[], key: string | undefined, dir: "asc" | "desc"): T[] {
  const col = cols.find((c) => c.key === key && c.sort);
  if (!col?.sort) return rows;
  const f = col.sort;
  return [...rows].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return dir === "asc" ? c : -c;
  });
}

/**
 * A desktop table whose headers sort it: plain links (?sort=…&dir=…), no script, so the
 * sorted view can be bookmarked or sent. The current column carries aria-sort.
 */
export function SortTable<T>({ rows, cols, sort, dir, href, rowKey, caption }: { rows: T[]; cols: Col<T>[]; sort?: string; dir: "asc" | "desc"; href: (key: string, dir: "asc" | "desc") => string; rowKey: (r: T) => string; caption: string }) {
  return (
    <div className="card overflow-x-auto px-2 py-1">
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.12em] text-mist">
            {cols.map((c) => {
              const on = sort === c.key;
              const next: "asc" | "desc" = on ? (dir === "asc" ? "desc" : "asc") : c.num ? "desc" : "asc";
              return (
                <th key={c.key} scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined} className={`px-3 py-3 align-bottom font-medium ${c.num ? "text-right" : ""}`}>
                  {c.sort ? (
                    <Link href={href(c.key, next)} className={`inline-flex items-center gap-1 hover:text-cream ${on ? "text-gold-light" : ""}`} scroll={false}>
                      {c.label}
                      <span aria-hidden="true" className={on ? "" : "opacity-0"}>
                        {dir === "asc" && on ? "↑" : "↓"}
                      </span>
                    </Link>
                  ) : (
                    c.label
                  )}
                  {c.hint ? <span className="block text-[10.5px] normal-case tracking-normal text-mist/80">{c.hint}</span> : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-t border-(--sf-rule) hover:bg-navy-mid/40">
              {cols.map((c) => (
                <td key={c.key} className={`px-3 py-3 align-middle ${c.num ? "num text-right" : ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
