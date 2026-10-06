const PATHS: Record<string, string> = {
  home: '<path d="M4 11l8-7 8 7v9H5v-9z"/>',
  brief: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 9h6M9 13h6"/>',
  fnb: '<path d="M5 9h12v5a5 5 0 01-5 5h-2a5 5 0 01-5-5V9zM17 11h1.5a2 2 0 010 4H17"/>',
  roster: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  esg: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  port: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  rooms: '<path d="M3 18v-6a3 3 0 013-3h12a3 3 0 013 3v6M3 15h18M6 9V6h5v3"/>',
  maint: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  night: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0"/>',
  logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
};

export function Icon({ name, size = 20, className = "" }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }} />
  );
}

/** The ServiceFlow mark: a gold S in two strokes with a spark at the centre. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sfGold" gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="100" y2="110">
          <stop offset="0" stopColor="#E6CB9C" />
          <stop offset=".55" stopColor="#C79B5B" />
          <stop offset="1" stopColor="#9C7438" />
        </linearGradient>
      </defs>
      <path d="M78.02 25.38A22 22 0 1 0 60 60A22 22 0 1 1 41.98 94.62" stroke="url(#sfGold)" strokeWidth="7.5" strokeLinecap="round" />
      <path d="M60 47Q60 60 73 60Q60 60 60 73Q60 60 47 60Q60 60 60 47Z" fill="#FBEFD2" />
    </svg>
  );
}

export function Lockup({ scope }: { scope?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark size={30} />
      <div className="leading-none">
        <div className="display text-[19px] tracking-tight">
          Service<em className="not-italic font-[500] italic text-gold-light">Flow</em>
        </div>
        {scope ? <div className="eyebrow mt-1 text-[9.5px]">{scope}</div> : <div className="eyebrow mt-1 text-[9.5px]">by SparkEdge</div>}
      </div>
    </div>
  );
}
