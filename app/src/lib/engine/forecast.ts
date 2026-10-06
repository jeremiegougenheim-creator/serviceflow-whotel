/**
 * Covers forecast — "inside-out": tomorrow's covers come from who is in house,
 * on which rate, from where, and who leaves early. Never a flat attach rate.
 */
import type {
  BanquetSignal,
  BookingSignal,
  CoversForecast,
  Driver,
  EventSignal,
  HistoryPoint,
  OutletCfg,
  PmsSignals,
  WaveSplit,
  WeatherSignal,
} from "./types";

// ── defaults (overridden by outlet.settings) ───────────────────────────────

export const ATTACH_BY_RATE_CODE: Record<string, number> = {
  breakfast_inclusive: 0.92,
  half_board: 0.88,
  package: 0.75,
  package_leisure: 0.75,
  default: 0.6,
  room_only: 0.27,
  redemption: 0.5,
  redemption_points: 0.5,
};

export const LOUNGE_DIVERT_TIERS = ["ambassador", "titanium"];
export const LOUNGE_ATTACH = 0.85;

/** Length-of-stay fatigue: the longer the stay, the fewer breakfasts. Departure day is the strongest. */
export const LOS_FATIGUE: Record<string, number> = { day1: 1.0, day2_4: 0.95, day5plus: 0.85, departure: 1.05 };

/** Wave profiles by travel source (wave 1, 2, 3). Groups and departures eat early; FIT staggers. */
export const WAVE_PROFILES: Record<string, [number, number, number]> = {
  tour_group: [0.75, 0.2, 0.05],
  fit: [0.2, 0.55, 0.25],
  mice: [0.45, 0.4, 0.15],
  departure: [0.8, 0.18, 0.02],
  other: [0.35, 0.45, 0.2],
};

export const GUESTS_PER_ROOM_DEFAULT = 1.62;

const r0 = (n: number) => Math.round(n);
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function normalise(mix: Record<string, number>): Record<string, number> {
  const entries = Object.entries(mix).filter(([, v]) => Number.isFinite(v) && v > 0);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  if (sum <= 0) return {};
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

/** Blended attach rate from the rate-code mix (shares sum to 1). */
export function attachFromRateCodes(mix: Record<string, number>, table: Record<string, number> = ATTACH_BY_RATE_CODE): number {
  const m = normalise(mix);
  const keys = Object.keys(m);
  if (keys.length === 0) return table.default ?? 0.6;
  return keys.reduce((s, k) => s + m[k] * (table[k] ?? table.default ?? 0.6), 0);
}

/** Attach for one guest profile (unit tested against the product rules). */
export function computeAttach(p: {
  rateCode: string;
  loyaltyTier?: string | null;
  losKey?: string; // day1 | day2_4 | day5plus | departure
  arrivalHour?: number | null;
  table?: Record<string, number>;
  loungeTiers?: string[];
}): number {
  const table = p.table ?? ATTACH_BY_RATE_CODE;
  let base = table[p.rateCode] ?? table.default ?? 0.6;
  if (p.loyaltyTier && (p.loungeTiers ?? LOUNGE_DIVERT_TIERS).includes(p.loyaltyTier)) {
    base = Math.max(0.05, base - LOUNGE_ATTACH);
  }
  const fatigue = LOS_FATIGUE[p.losKey ?? "day2_4"] ?? 0.95;
  const late = (p.arrivalHour ?? 0) >= 23 ? 0.4 : 1.0;
  return base * fatigue * late;
}

/** Wave split from the travel-source mix, mapped onto the outlet's configured waves. */
export function waveSplitFromSources(sourceMix: Record<string, number>, departureShare: number, wavesIn: { id: string; label: string; startsAt: string; shareDefault: number }[]): { waveId: string; label: string; startsAt: string; share: number }[] {
  const waves = wavesIn.map((w) => ({ waveId: w.id, label: w.label, startsAt: w.startsAt, shareDefault: w.shareDefault }));
  const m = normalise(sourceMix);
  const profile: [number, number, number] = [0, 0, 0];
  let weight = 0;
  for (const [src, share] of Object.entries(m)) {
    const prof = WAVE_PROFILES[src] ?? WAVE_PROFILES.other;
    for (let i = 0; i < 3; i++) profile[i] += prof[i] * share;
    weight += share;
  }
  if (weight === 0) {
    const prof = WAVE_PROFILES.other;
    for (let i = 0; i < 3; i++) profile[i] = prof[i];
    weight = 1;
  }
  for (let i = 0; i < 3; i++) profile[i] /= weight;
  // departures before 11:00 eat first
  const dep = clamp(departureShare, 0, 0.6);
  const blended: [number, number, number] = [
    profile[0] * (1 - dep) + WAVE_PROFILES.departure[0] * dep,
    profile[1] * (1 - dep) + WAVE_PROFILES.departure[1] * dep,
    profile[2] * (1 - dep) + WAVE_PROFILES.departure[2] * dep,
  ];
  const sorted = [...waves].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (sorted.length === 0) return [];
  if (sorted.length === 1) return [{ ...sorted[0], share: 1 }];
  if (sorted.length === 2) {
    return [
      { ...sorted[0], share: blended[0] + blended[1] * 0.5 },
      { ...sorted[1], share: blended[2] + blended[1] * 0.5 },
    ];
  }
  // 3+ waves: first three carry the profile, extra waves share the tail
  const out = sorted.map((w, i) => ({ ...w, share: i < 3 ? blended[i] : 0 }));
  if (sorted.length > 3) {
    const tail = blended[2] / (sorted.length - 2);
    for (let i = 2; i < sorted.length; i++) out[i].share = tail;
  }
  return out;
}

/** Uncertainty band from the outlet's own history: the spread of past forecast errors. */
export function errorBand(history: HistoryPoint[]): number {
  const errs = history
    .filter((h) => h.forecastP50 && h.actualCovers)
    .map((h) => (h.actualCovers! - h.forecastP50!) / h.forecastP50!)
    .slice(-28);
  if (errs.length < 7) return 0.06;
  const mean = errs.reduce((s, e) => s + e, 0) / errs.length;
  const sd = Math.sqrt(errs.reduce((s, e) => s + (e - mean) ** 2, 0) / errs.length);
  return clamp(1.2816 * sd, 0.03, 0.2); // ~P10/P90
}

/** Weather effect on an in-house breakfast: rain keeps guests in, heat lightens the plate. */
export function weatherCoversMultiplier(w: WeatherSignal | null): { mult: number; label: string | null } {
  if (!w) return { mult: 1, label: null };
  if ((w.rainProb ?? 0) >= 0.6 || w.condition === "rain" || w.condition === "storm") return { mult: 1.03, label: "Rain forecast: more guests breakfast in house" };
  if ((w.tempC ?? 25) >= 31 || w.condition === "hot") return { mult: 0.99, label: "Hot day: lighter plates" };
  return { mult: 1, label: null };
}

function dayName(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

/** Breakfast (buffet) forecast from the PMS profile of the house. */
export function forecastBreakfast(input: {
  outlet: OutletCfg;
  pms: PmsSignals;
  weather: WeatherSignal | null;
  events: EventSignal[];
  history: HistoryPoint[];
  previousDayPms?: PmsSignals | null;
}): CoversForecast {
  const { outlet, pms, weather, events, history } = input;
  const table = { ...ATTACH_BY_RATE_CODE, ...(outlet.settings.attach_by_rate_code ?? {}) };
  const loungeTiers = outlet.settings.lounge_divert_tiers ?? LOUNGE_DIVERT_TIERS;
  const drivers: Driver[] = [];
  let signals = 0;

  const guests = pms.guestsInHouse > 0 ? pms.guestsInHouse : pms.roomsOccupied * GUESTS_PER_ROOM_DEFAULT;
  signals += 1;

  // 1. attach by rate code
  const rateMix = normalise(pms.rateCodeMix);
  const attach = attachFromRateCodes(rateMix, table);
  const biShare = rateMix.breakfast_inclusive ?? 0;
  if (Object.keys(rateMix).length) {
    signals += 1;
    drivers.push({
      label: `Breakfast-inclusive rates ${Math.round(biShare * 100)}% of rooms`,
      source: "PMS",
      effect: `${biShare >= 0.5 ? "+" : "−"}${Math.round(Math.abs(biShare - 0.5) * guests * 0.9)}`,
      weight: Math.abs(biShare - 0.5) * guests,
    });
  }

  // 2. lounge diversion
  const tierMix = normalise(pms.loyaltyTierMix);
  const divertShare = loungeTiers.reduce((s, t) => s + (tierMix[t] ?? 0), 0);
  const loungeGuests = pms.loungeEligible > 0 ? pms.loungeEligible : guests * divertShare;
  if (loungeGuests > 0) {
    signals += 1;
    drivers.push({ label: `${r0(loungeGuests)} guests served in the lounge`, source: "PMS", effect: `−${r0(loungeGuests * LOUNGE_ATTACH)}`, weight: loungeGuests * LOUNGE_ATTACH });
  }

  // 3. length of stay and departures
  const los = normalise(pms.losDistribution);
  const depShare = pms.roomsOccupied > 0 ? clamp(pms.departures / pms.roomsOccupied, 0, 1) : 0;
  let fatigue = 0;
  if (Object.keys(los).length) {
    for (const [k, v] of Object.entries(los)) fatigue += v * (LOS_FATIGUE[k] ?? 0.95);
    signals += 1;
  } else fatigue = 0.95;
  fatigue = fatigue * (1 - depShare) + LOS_FATIGUE.departure * depShare;
  if (pms.departuresAm > 0) {
    signals += 1;
    drivers.push({ label: `${pms.departuresAm} check-outs before 11:00`, source: "PMS", effect: "earlier", weight: pms.departuresAm * 0.3 });
  }

  // 4. late arrivals the night before
  const lateGuests = pms.lateArrivalsPrev * GUESTS_PER_ROOM_DEFAULT;
  if (lateGuests > 0) {
    signals += 1;
    drivers.push({ label: `${pms.lateArrivalsPrev} arrivals after 23:00`, source: "PMS", effect: `−${r0(lateGuests * 0.6 * attach)}`, weight: lateGuests * 0.6 * attach });
  }

  // 5. groups in house with breakfast
  const groups = (pms.groupManifest ?? []).filter((g) => g.size > 0);
  let groupCovers = 0;
  for (const g of groups) {
    const a = g.breakfast === false ? table.default ?? 0.6 : 0.92;
    groupCovers += g.size * a;
    signals += 1;
    const gname = g.name && /\d/.test(g.name) ? g.name : `${g.name ?? "Group"} of ${g.size}`;
    drivers.push({ label: `${gname} in house${g.breakfast === false ? "" : ", breakfast included"}`, source: "PMS", effect: `+${r0(g.size * a)}`, weight: g.size * a });
  }
  const groupGuests = groups.reduce((s, g) => s + g.size, 0);

  // base covers: non-group guests × attach × fatigue − lounge − late, + group covers
  const nonGroup = Math.max(0, guests - groupGuests - lateGuests * 0.6);
  let covers = nonGroup * attach * fatigue - loungeGuests * LOUNGE_ATTACH * attach + groupCovers;

  // 6. weather
  const w = weatherCoversMultiplier(weather);
  if (w.label) {
    signals += 1;
    drivers.push({ label: w.label, source: "Weather", effect: `${w.mult >= 1 ? "+" : "−"}${r0(Math.abs(w.mult - 1) * covers)}`, weight: Math.abs(w.mult - 1) * covers });
  }
  covers *= w.mult;

  // 7. events with a lift on this outlet
  for (const e of events.filter((e) => !e.outletId || e.outletId === outlet.id)) {
    if (e.lift && e.lift !== 1) {
      signals += 1;
      drivers.push({ label: e.label, source: "Events", effect: `${e.lift >= 1 ? "+" : "−"}${r0(Math.abs(e.lift - 1) * covers)}`, weight: Math.abs(e.lift - 1) * covers });
      covers *= e.lift;
    } else if (e.kind === "group" && !groups.length) {
      signals += 1;
      drivers.push({ label: e.label, source: "Events", effect: "watch", weight: 1 });
    }
  }

  // 8. nationality mix: long-haul guests eat earlier
  const nat = normalise(pms.nationalityMix);
  const longHaul = (nat.western ?? 0) + (nat.other ?? 0) * 0.5;
  if (Object.keys(nat).length) {
    signals += 1;
    if (longHaul >= 0.3) drivers.push({ label: `Earlier peak, 07:15: ${Math.round(longHaul * 100)}% long-haul guests`, source: "PMS", effect: "earlier", weight: 2 });
  }

  // 9. learning: bias of recent forecasts (corrections enter the next plan)
  const recent = history.filter((h) => h.forecastP50 && h.actualCovers).slice(-14);
  if (recent.length >= 7) {
    const bias = recent.reduce((s, h) => s + (h.actualCovers! - h.forecastP50!) / h.forecastP50!, 0) / recent.length;
    const adj = clamp(bias, -0.08, 0.08) * 0.5;
    if (Math.abs(adj) >= 0.005) {
      signals += 1;
      drivers.push({ label: `Recent services ran ${adj > 0 ? "above" : "below"} forecast`, source: "History", effect: `${adj > 0 ? "+" : "−"}${Math.round(Math.abs(adj) * 100)}%`, weight: Math.abs(adj) * covers });
      covers *= 1 + adj;
    }
  }

  const capacity = outlet.capacity ? outlet.capacity * 2.4 : Infinity; // turns over the service
  const p50 = r0(clamp(covers, 0, capacity));
  const band = errorBand(history);
  const p10 = r0(p50 * (1 - band));
  const p90 = r0(p50 * (1 + band));

  // what the kitchen would have planned on habit: trailing 4-week average for this weekday, else usual_covers
  const dow = new Date(pms.serviceDate + "T12:00:00Z").getUTCDay();
  const sameDow = history.filter((h) => h.actualCovers && new Date(h.serviceDate + "T12:00:00Z").getUTCDay() === dow).slice(-4);
  const usual = sameDow.length >= 2 ? r0(sameDow.reduce((s, h) => s + h.actualCovers!, 0) / sameDow.length) : r0(outlet.settings.usual_covers ?? p50);

  const waves = waveSplitFromSources(pms.travelSourceMix, depShare, outlet.waves).map<WaveSplit>((w2) => ({ ...w2, covers: r0(p50 * w2.share) }));
  // round-off goes to the biggest wave
  const diff = p50 - waves.reduce((s, x) => s + x.covers, 0);
  if (waves.length && diff !== 0) waves.sort((a, b) => b.share - a.share)[0].covers += diff;
  waves.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  drivers.sort((a, b) => b.weight - a.weight);
  const occupancy = pms.roomsTotal ? pms.roomsOccupied / pms.roomsTotal : null;

  return {
    p10,
    p50,
    p90,
    usual,
    occupancy,
    waveSplit: waves,
    drivers: drivers.slice(0, 6),
    signalsRead: signals,
    inputs: { guests, attach: +attach.toFixed(3), fatigue: +fatigue.toFixed(3), loungeGuests: r0(loungeGuests), groupCovers: r0(groupCovers), weather: w.mult, band: +band.toFixed(3) },
    headline: `${dayName(pms.serviceDate)}, ${p50} covers.`,
    subline: `Breakfast forecast ± ${p90 - p50} · ${signals} signals read`,
  };
}

/** À la carte restaurant or bar: bookings plus the walk-ins the day of the week usually brings. */
export function forecastBookings(input: {
  outlet: OutletCfg;
  serviceDate: string;
  booking: BookingSignal | null;
  weather: WeatherSignal | null;
  events: EventSignal[];
  history: HistoryPoint[];
}): CoversForecast {
  const { outlet, booking, weather, events, history, serviceDate } = input;
  const drivers: Driver[] = [];
  let signals = 0;
  const dow = new Date(serviceDate + "T12:00:00Z").getUTCDay();
  const sameDow = history.filter((h) => h.actualCovers && new Date(h.serviceDate + "T12:00:00Z").getUTCDay() === dow).slice(-4);
  const usual = sameDow.length >= 2 ? r0(sameDow.reduce((s, h) => s + h.actualCovers!, 0) / sameDow.length) : r0(outlet.settings.usual_covers ?? 60);

  let covers = usual;
  if (booking) {
    signals += 1;
    const walkIn = booking.walkInExpected || r0(usual * (outlet.settings.walk_in_share ?? 0.12));
    covers = booking.coversBooked + walkIn;
    drivers.push({ label: `${booking.coversBooked} covers booked, ${walkIn} walk-ins expected`, source: "Bookings", effect: `${covers - usual >= 0 ? "+" : "−"}${Math.abs(covers - usual)}`, weight: Math.abs(covers - usual) });
    for (const p of booking.parties ?? []) {
      if (p.size >= 8) {
        signals += 1;
        drivers.push({ label: p.note ?? `Party of ${p.size}${p.at ? ` at ${p.at}` : ""}`, source: "Bookings", effect: `+${p.size}`, weight: p.size });
      }
    }
  }
  const w = weatherCoversMultiplier(weather);
  if (weather && (weather.rainProb ?? 0) >= 0.6) {
    signals += 1;
    drivers.push({ label: "Rain forecast: fewer walk-ins", source: "Weather", effect: `−${r0(covers * 0.06)}`, weight: covers * 0.06 });
    covers *= 0.94;
  } else if (w.label) {
    signals += 1;
  }
  for (const e of events.filter((e) => !e.outletId || e.outletId === outlet.id)) {
    if (e.lift && e.lift !== 1) {
      signals += 1;
      drivers.push({ label: e.label, source: "Events", effect: `${e.lift >= 1 ? "+" : "−"}${r0(Math.abs(e.lift - 1) * covers)}`, weight: Math.abs(e.lift - 1) * covers });
      covers *= e.lift;
    }
  }
  const p50 = r0(covers);
  const band = errorBand(history);
  const p10 = r0(p50 * (1 - band));
  const p90 = r0(p50 * (1 + band));

  // waves from the parties' times, else the configured default shares
  const waves = [...outlet.waves].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const shares = waves.map((wv) => wv.shareDefault);
  const peakAt = booking?.peakAt ?? booking?.largestPartyAt ?? null;
  if (peakAt && waves.length > 1) {
    const idx = waves.findIndex((wv, i) => i === waves.length - 1 || peakAt < waves[i + 1].startsAt);
    if (idx >= 0) {
      shares[idx] += 0.1;
    }
  }
  const sum = shares.reduce((s, x) => s + x, 0) || 1;
  const waveSplit: WaveSplit[] = waves.map((wv, i) => ({ waveId: wv.id, label: wv.label, startsAt: wv.startsAt, share: shares[i] / sum, covers: r0((p50 * shares[i]) / sum) }));
  const peakCovers = booking?.peakCovers ?? (waveSplit.length ? Math.max(...waveSplit.map((x) => x.covers)) : 0);
  drivers.sort((a, b) => b.weight - a.weight);
  const label = outlet.type === "bar" ? "Bar" : outlet.type === "restaurant" ? "Dinner" : outlet.name;
  return {
    p10,
    p50,
    p90,
    usual,
    occupancy: null,
    waveSplit,
    drivers: drivers.slice(0, 5),
    signalsRead: signals,
    inputs: { usual, band: +band.toFixed(3), peakAt, peakCovers },
    headline: `${label} tomorrow`,
    subline: `${p50} covers · ${peakCovers} at ${peakAt ?? waveSplit.at(-1)?.startsAt ?? ""}`,
  };
}

/** Banquets: cook to the final count, never to the booking. */
export function forecastBanquet(input: { outlet: OutletCfg; banquets: BanquetSignal[] }): CoversForecast & { cookCount: number; diets: number } {
  const { outlet, banquets } = input;
  const bufferPct = outlet.settings.buffer_pct ?? 0.03;
  const confirmed = banquets.reduce((s, b) => s + b.confirmedCount, 0);
  const booked = banquets.reduce((s, b) => s + b.bookedCount, 0);
  const cook = Math.min(booked || Infinity, Math.ceil(confirmed * (1 + bufferPct)));
  const diets = banquets.reduce((s, b) => s + Object.values(b.diets ?? {}).reduce((x, y) => x + y, 0), 0);
  const wave = outlet.waves[0];
  const drivers: Driver[] = banquets.map((b) => ({ label: `${b.name}: ${b.confirmedCount} confirmed of ${b.bookedCount} booked`, source: "Banquets", effect: `${b.confirmedCount}`, weight: b.confirmedCount }));
  if (diets) drivers.push({ label: `${diets} dietary plates`, source: "Banquets", effect: `${diets}`, weight: diets });
  return {
    p10: confirmed,
    p50: cook,
    p90: booked || cook,
    usual: booked || cook,
    occupancy: null,
    waveSplit: wave ? [{ waveId: wave.id, label: wave.label, startsAt: wave.startsAt, share: 1, covers: cook }] : [],
    drivers,
    signalsRead: banquets.length + (diets ? 1 : 0),
    inputs: { confirmed, booked, bufferPct, diets },
    headline: banquets[0] ? `${banquets[0].venue ?? outlet.name} · ${banquets[0].name}` : outlet.name,
    subline: `${confirmed} confirmed · ${cook} to cook · ${diets} diets`,
    cookCount: cook,
    diets,
  };
}
