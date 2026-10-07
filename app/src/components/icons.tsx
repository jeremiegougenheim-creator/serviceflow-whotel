/** Line icons shared with the prototype. 24-box, 1.6 stroke. */
const PATHS = {
  home: <path d="M4 11l8-7 8 7v9H5v-9z" />,
  brief: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  fnb: <path d="M5 9h12v5a5 5 0 01-5 5h-2a5 5 0 01-5-5V9zM17 11h1.5a2 2 0 010 4H17" />,
  roster: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  esg: <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />,
  port: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  rooms: <path d="M3 18v-6a3 3 0 013-3h12a3 3 0 013 3v6M3 15h18M6 9V6h5v3" />,
  maint: <path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </>
  ),
  night: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>
  ),
  bell: <path d="M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zM10 21h4" />,
  check: <path d="M5 13l4 4L19 7" />,
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  swap: <path d="M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l3 3m-3-3l-3 3" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

/** The ServiceFlow mark: the gold double-stroke S with its centre spark. */
export function Mark({ size = 28, gid = "sfGold" }: { size?: number; gid?: string }) {
  // each copy needs its own gradient id: a gradient inside a hidden copy (the sidebar on a phone) paints nothing
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="100" y2="110">
          <stop offset="0" stopColor="#E6CB9C" />
          <stop offset=".55" stopColor="#C79B5B" />
          <stop offset="1" stopColor="#9C7438" />
        </linearGradient>
      </defs>
      <path d="M78.02 25.38A22 22 0 1 0 60 60A22 22 0 1 1 41.98 94.62" stroke={`url(#${gid})`} strokeWidth="7.5" strokeLinecap="round" />
      <path className="sf-spark" d="M60 47Q60 60 73 60Q60 60 60 73Q60 60 47 60Q60 60 60 47Z" fill="#FBEFD2" />
    </svg>
  );
}

export function Lockup({ scope, gid }: { scope?: string; gid?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark size={30} gid={gid} />
      <div className="leading-none">
        <div className="font-display text-[22px] font-semibold tracking-[-0.01em] text-cream">
          Service<em className="text-gold-light">Flow</em>
        </div>
        <div className="mt-0.5 text-[9.5px] font-medium uppercase tracking-[0.22em] text-mist">{scope ?? "by SparkEdge"}</div>
      </div>
    </div>
  );
}
