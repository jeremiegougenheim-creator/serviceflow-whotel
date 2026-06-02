import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { format } from "date-fns";
import WeekCarousel from "@/components/WeekCarousel";
import OutletTrigger from "@/components/OutletTrigger";

async function getLatestForecast(outletId: string) {
  const supabase = createClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: forecast } = await supabase
    .from("forecasts")
    .select("*")
    .eq("outlet_id", outletId)
    .gte("service_date", today)
    .order("service_date", { ascending: true })
    .limit(1)
    .single();

  return forecast;
}

async function getOutlet(propertyId: string) {
  const supabase = createClient();

  const { data: outlet } = await supabase
    .from("outlets")
    .select("*")
    .eq("property_id", propertyId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  return outlet;
}

async function getRecentOutcomes(outletId: string) {
  const supabase = createClient();

  const { data: outcomes } = await supabase
    .from("outcomes")
    .select("*")
    .eq("outlet_id", outletId)
    .not("actual_covers", "is", null)
    .order("service_date", { ascending: false })
    .limit(14);

  return outcomes ?? [];
}

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  // Load user's primary property membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("property_id, role, properties(name, keys, timezone)")
    .eq("user_id", session.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const property = membership?.properties as
    | { name: string; keys: number; timezone: string }
    | null
    | undefined;

  const outlet = membership ? await getOutlet(membership.property_id) : null;

  const forecast = outlet ? await getLatestForecast(outlet.id) : null;

  const outcomes = outlet ? await getRecentOutcomes(outlet.id) : [];

  // KPIs derived from available data
  const avgAccuracy =
    outcomes.length > 0
      ? Math.round(
          outcomes
            .filter((o) => o.accuracy_pct !== null)
            .reduce((sum, o) => sum + (o.accuracy_pct ?? 0), 0) /
            Math.max(
              1,
              outcomes.filter((o) => o.accuracy_pct !== null).length
            )
        )
      : null;

  const totalSavedUsd = outcomes.reduce(
    (sum, o) => sum + (o.food_cost_saved_usd ?? 0),
    0
  );

  const totalCo2eKg = outcomes.reduce(
    (sum, o) => sum + (o.total_co2e_kg ?? 0),
    0
  );

  const todayDisplay = format(new Date(), "EEE d MMM yyyy");

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-lauds-charcoal text-lauds-cream px-5 pt-14 pb-6 relative overflow-hidden">
        {/* Grid texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(108deg, transparent 0, transparent 44px, rgba(201,169,122,0.05) 44px, rgba(201,169,122,0.05) 45px)",
          }}
        />
        {/* Gold rule bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, #A0784A, #C9A97A, #A0784A, transparent)",
            opacity: 0.55,
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 border border-lauds-champagne rounded-lg flex items-center justify-center">
              <span className="font-serif text-lg font-medium text-lauds-champagne-light leading-none">
                L
              </span>
            </div>
            <span className="text-xs font-semibold tracking-[0.2em] uppercase text-lauds-cream/80">
              {property?.name ?? "Lauds"}
            </span>
            <div className="ml-auto">
              <OutletTrigger />
            </div>
          </div>

          <h1 className="font-serif text-4xl font-medium leading-[1.05] mb-2">
            Good morning,{" "}
            <em className="italic font-normal text-lauds-champagne-light">
              chef.
            </em>
          </h1>
          <p className="text-sm leading-relaxed text-lauds-cream/70">
            {forecast
              ? `${forecast.covers_p50} covers forecast for tomorrow's service.`
              : "Your next forecast will appear here."}
          </p>

          <div className="flex items-center gap-2 mt-3 text-xs text-lauds-cream/50 flex-wrap">
            <span>{todayDisplay}</span>
            {forecast && (
              <>
                <span className="w-1 h-1 rounded-full bg-lauds-cream/40" />
                <span>{forecast.covers_p50} covers p50</span>
                <span className="w-1 h-1 rounded-full bg-lauds-cream/40" />
                <span>{Math.round(forecast.occupancy_input * 100)}% occ.</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Week carousel */}
      <div className="px-5 py-4 border-b border-lauds-border bg-lauds-surface">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 bg-lauds-champagne" />
          <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
            This week
          </span>
        </div>
        <WeekCarousel />
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* KPI grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              This month
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile
              label="Covers (p50)"
              value={forecast ? forecast.covers_p50.toString() : "—"}
              sub="tomorrow's forecast"
              valueClass="text-lauds-blue"
            />
            <KpiTile
              label="Savings"
              value={
                totalSavedUsd > 0
                  ? `$${Math.round(totalSavedUsd).toLocaleString()}`
                  : "—"
              }
              sub="food cost saved"
              valueClass="text-lauds-esg"
            />
            <KpiTile
              label="Accuracy"
              value={avgAccuracy !== null ? `${avgAccuracy}%` : "—"}
              sub="14-day avg"
              valueClass="text-lauds-charcoal"
            />
            <KpiTile
              label="CO₂e avoided"
              value={
                totalCo2eKg > 0 ? `${totalCo2eKg.toFixed(1)} kg` : "—"
              }
              sub="vs baseline"
              valueClass="text-lauds-esg"
            />
          </div>
        </div>

        {/* Navigation tiles */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              Modules
            </span>
          </div>

          <div className="space-y-2.5">
            <NavTile
              href="/brief"
              label="Morning Brief"
              description="Today's forecast, actions & station PARs"
              accentClass="bg-lauds-blue/10"
              iconClass="text-lauds-blue"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14v18l-7-4-7 4z" />
                </svg>
              }
            />
            <NavTile
              href="/fb"
              label="F&B Operations"
              description="Station-level prep, waves & live tracking"
              accentClass="bg-lauds-mag/10"
              iconClass="text-lauds-mag"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h13a4 4 0 010 8h-1M4 8v8a4 4 0 004 4h5a4 4 0 004-4M6 4v2M9 4v2M12 4v2" />
                </svg>
              }
            />
            <NavTile
              href="/esg"
              label="ESG Dashboard"
              description="Waste, CO₂e savings & sustainability metrics"
              accentClass="bg-lauds-esg/10"
              iconClass="text-lauds-esg"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 22c5-3 8-7 8-12V5l-8-3-8 3v5c0 5 3 9 8 12z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
              }
            />
            <NavTile
              href="/portfolio"
              label="Portfolio"
              description="Portfolio KPIs, outlet pipeline & ESG reporting"
              accentClass="bg-lauds-champagne/10"
              iconClass="text-lauds-champagne"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white border border-lauds-border rounded-2xl p-3.5 shadow-lauds-card">
      <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-lauds-muted">
        {label}
      </p>
      <p
        className={`font-serif text-3xl font-medium leading-[1.05] mt-1.5 tracking-tight ${valueClass ?? "text-lauds-charcoal"}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-lauds-muted mt-1 leading-tight">{sub}</p>
    </div>
  );
}

function NavTile({
  href,
  label,
  description,
  icon,
  accentClass,
  iconClass,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  accentClass: string;
  iconClass: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 bg-white border border-lauds-border rounded-2xl p-3.5 shadow-lauds-card active:scale-[0.985] transition-transform"
    >
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accentClass} ${iconClass}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-serif text-[18px] font-medium text-lauds-charcoal tracking-tight leading-tight">
          {label}
        </p>
        <p className="text-[11.5px] text-lauds-muted mt-0.5 leading-snug">
          {description}
        </p>
      </div>
      <span className="font-serif text-2xl text-lauds-champagne flex-shrink-0">
        ›
      </span>
    </Link>
  );
}
