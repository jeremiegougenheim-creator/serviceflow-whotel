/**
 * Database rows → engine shapes. Pure mapping, no client: the engine (service role) and the
 * screens that replay it (the signed-in user's client, RLS applies) read through the same code.
 */
import type { Json, Tables } from "@/lib/supabase/database.types";
import type { BookingSignal, EventSignal, OutletCfg, PmsSignals, PropertyCfg, StationCfg, WeatherSignal } from "./types";

type PropertyRow = Tables<"properties">;
type OutletRow = Tables<"outlets">;
type StationRow = Tables<"stations">;
type WaveRow = Tables<"waves">;

export function asObj<T extends object>(j: Json | null | undefined): T {
  return (j && typeof j === "object" && !Array.isArray(j) ? (j as T) : ({} as T)) as T;
}
export function asArr<T>(j: Json | null | undefined): T[] {
  return Array.isArray(j) ? (j as T[]) : [];
}

export function toPropertyCfg(p: PropertyRow): PropertyCfg {
  return { id: p.id, name: p.name, keys: p.keys, timezone: p.timezone, currency: p.currency, settings: asObj(p.settings) };
}

export function toStationCfg(s: StationRow): StationCfg {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    kind: s.station_kind as StationCfg["kind"],
    foodCategory: s.food_category,
    unit: s.unit,
    basePar: Number(s.base_par),
    usualCovers: s.usual_covers == null ? null : Number(s.usual_covers),
    costPerUnit: Number(s.cost_per_unit),
    kgPerUnit: Number(s.kg_per_unit),
    highValue: s.high_value,
    nationalityPriors: asObj(s.nationality_priors),
    dowProfile: asObj(s.dow_profile),
    weatherProfile: asObj(s.weather_profile),
    settings: asObj(s.settings),
    sortOrder: s.sort_order,
  };
}

export function toOutletCfg(o: OutletRow, waves: WaveRow[], stations: StationRow[]): OutletCfg {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    type: o.outlet_type as OutletCfg["type"],
    opensAt: o.opens_at.slice(0, 5),
    closesAt: o.closes_at.slice(0, 5),
    capacity: o.capacity_pax,
    settings: asObj(o.settings),
    waves: waves.filter((w) => w.outlet_id === o.id).map((w) => ({ id: w.id, label: w.label, startsAt: w.starts_at.slice(0, 5), shareDefault: Number(w.share_default), sortOrder: w.sort_order })),
    stations: stations.filter((s) => s.outlet_id === o.id && s.active).sort((a, b) => a.sort_order - b.sort_order).map(toStationCfg),
  };
}

export function toPms(r: Tables<"pms_daily">): PmsSignals {
  return {
    serviceDate: r.service_date,
    roomsOccupied: r.rooms_occupied,
    roomsTotal: r.rooms_total,
    guestsInHouse: r.guests_in_house,
    arrivals: r.arrivals,
    departures: r.departures,
    departuresAm: r.departures_am,
    lateArrivalsPrev: r.late_arrivals_prev,
    earlyCheckins: r.early_checkins,
    loungeEligible: r.lounge_eligible,
    vipArrivals: r.vip_arrivals,
    suitesOccupied: r.suites_occupied,
    rateCodeMix: asObj(r.rate_code_mix),
    loyaltyTierMix: asObj(r.loyalty_tier_mix),
    travelSourceMix: asObj(r.travel_source_mix),
    nationalityMix: asObj(r.nationality_mix),
    losDistribution: asObj(r.los_distribution),
    groupManifest: asArr(r.group_manifest),
  };
}

export function toWeather(w: Tables<"weather_daily"> | null | undefined): WeatherSignal | null {
  return w ? { tempC: w.temp_c == null ? null : Number(w.temp_c), rainProb: w.rain_prob == null ? null : Number(w.rain_prob), condition: w.condition } : null;
}

export function toEvent(e: Tables<"events_daily">): EventSignal {
  return { label: e.label, kind: e.kind, size: e.size, startsAt: e.starts_at, lift: Number(e.lift), outletId: e.outlet_id };
}

export function toBooking(b: Tables<"bookings_daily">): BookingSignal {
  return { coversBooked: b.covers_booked, walkInExpected: b.walk_in_expected, largestParty: b.largest_party, largestPartyAt: b.largest_party_at?.slice(0, 5) ?? null, peakAt: b.peak_at?.slice(0, 5) ?? null, peakCovers: b.peak_covers, parties: asArr(b.parties) };
}
