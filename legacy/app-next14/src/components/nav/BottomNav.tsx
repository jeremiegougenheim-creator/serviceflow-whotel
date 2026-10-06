"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const NAV_TABS = [
  {
    label: "Home",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-8 9 8M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    label: "Brief",
    href: "/brief",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14v18l-7-4-7 4z" />
      </svg>
    ),
  },
  {
    label: "F&B",
    href: "/fb",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h13a4 4 0 010 8h-1M4 8v8a4 4 0 004 4h5a4 4 0 004-4M6 4v2M9 4v2M12 4v2" />
      </svg>
    ),
  },
  {
    label: "ESG",
    href: "/esg",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 22c5-3 8-7 8-12V5l-8-3-8 3v5c0 5 3 9 8 12z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-lauds-border pb-safe z-50">
      <div className="flex items-stretch h-16">
        {NAV_TABS.map((tab) => {
          const isActive =
            tab.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                isActive
                  ? "text-lauds-champagne-dark"
                  : "text-lauds-secondary hover:text-lauds-charcoal"
              )}
            >
              {tab.icon}
              <span
                className={clsx(
                  "text-[10px] font-semibold tracking-[0.1em] uppercase",
                  isActive ? "text-lauds-champagne-dark" : "text-lauds-secondary"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
