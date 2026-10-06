/**
 * Voice and text logs, in English or Chinese.
 *   "Western hot over-prep 2 kg"      → waste
 *   "2506 done, 24 minutes"           → room done
 *   "Lift B door sensor fault"        → work order
 *   "142 seated"                      → pace
 *   "西式热食 多备 两公斤"              → waste
 *   "2506 完成 24 分钟"                → room done
 * The parser proposes; the person confirms before anything is written.
 */

export interface VoiceStation {
  id: string;
  name: string;
  slug: string;
  aliases?: string[];
}

export interface VoiceAsset {
  id: string;
  name: string;
  aliases?: string[];
}

export type VoiceIntent =
  | { intent: "waste"; stationId: string | null; stationName: string | null; kg: number | null; reason: string | null; confidence: number }
  | { intent: "room_done"; room: string; minutes: number | null; confidence: number }
  | { intent: "room_status"; room: string; status: "dnd_lifted" | "inspect" | "in_progress" | "skipped"; confidence: number }
  | { intent: "fault"; room: string | null; assetId: string | null; assetName: string | null; title: string; priority: "high" | "medium" | "low"; confidence: number }
  | { intent: "pace"; coversSeated: number; confidence: number }
  | { intent: "station_ready"; stationId: string | null; stationName: string | null; confidence: number }
  | { intent: "unknown"; confidence: number };

const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

/** Chinese numerals to numbers: 二十四 → 24, 两 → 2, 一点五 → 1.5, 半 → 0.5 */
export function parseChineseNumber(s: string): number | null {
  const str = s.replace(/點/g, "点");
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const [intPart, fracPart] = str.split("点");
  let n = 0;
  if (intPart) {
    if (intPart === "十") n = 10;
    else if (intPart.includes("十")) {
      const [tens, ones] = intPart.split("十");
      n = (tens ? CN_DIGITS[tens] ?? 1 : 1) * 10 + (ones ? CN_DIGITS[ones] ?? 0 : 0);
    } else {
      let ok = true;
      for (const ch of intPart) {
        if (ch === "半") {
          n += 0.5;
          continue;
        }
        if (CN_DIGITS[ch] == null) {
          ok = false;
          break;
        }
        n = n * 10 + CN_DIGITS[ch];
      }
      if (!ok) return null;
    }
  }
  if (fracPart) {
    let f = "";
    for (const ch of fracPart) {
      if (CN_DIGITS[ch] == null) return null;
      f += CN_DIGITS[ch];
    }
    n += parseFloat("0." + f);
  }
  return n;
}

const NUM = "(\\d+(?:[.,]\\d+)?|[零一二两兩三四五六七八九十半点點]+)";
const toNum = (s: string | undefined): number | null => {
  if (!s) return null;
  const t = s.replace(",", ".");
  return /^\d/.test(t) ? parseFloat(t) : parseChineseNumber(t);
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'"“”;:!?()\[\]]/g, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find the station the transcript names, by name, slug or alias (English words or Chinese substrings). */
export function matchStation<T extends VoiceStation>(text: string, stations: T[]): { station: T; score: number } | null {
  const t = norm(text);
  let best: { station: T; score: number } | null = null;
  for (const st of stations) {
    const candidates = [st.name, st.slug.replace(/_/g, " "), ...(st.aliases ?? [])].map((c) => c.toLowerCase());
    let score = 0;
    for (const c of candidates) {
      if (/[㐀-鿿]/.test(c)) {
        if (text.includes(c)) score = Math.max(score, 1);
        continue;
      }
      const words = c.split(/[\s&]+/).filter((w) => w.length > 1);
      if (!words.length) continue;
      const hits = words.filter((w) => t.includes(w)).length;
      const s = hits / words.length;
      if (s > score) score = s;
      if (t.includes(c)) score = 1;
    }
    if (score >= 0.5 && (!best || score > best.score)) best = { station: st, score };
  }
  return best;
}

export function parseVoice(transcriptRaw: string, ctx: { stations: VoiceStation[]; assets?: VoiceAsset[] }): VoiceIntent {
  const transcript = transcriptRaw.trim();
  const t = norm(transcript);

  // pace: "142 seated" · "已入座 142"
  const pace = t.match(new RegExp(`^${NUM}\\s*(covers?|seated|pax)\\b`)) ?? transcript.match(/入座\s*(\d+)/) ?? t.match(/(\d+)\s*seated/);
  if (pace) {
    const n = toNum(pace[1]);
    if (n != null) return { intent: "pace", coversSeated: Math.round(n), confidence: 0.9 };
  }

  // room done: "2506 done, 24 minutes" · "room 1512 ready" · "2506 完成 24 分钟"
  const room = t.match(/\b(\d{3,4})\b/);
  if (room) {
    const r = room[1];
    const done = /\b(done|finished|ready|clean|cleaned|complete|completed)\b/.test(t) || /完成|好了|做好|清洁完/.test(transcript);
    const minsMatch = t.match(new RegExp(`${NUM}\\s*(min|mins|minutes?)`)) ?? transcript.match(/([零一二两兩三四五六七八九十\d]+)\s*分钟/);
    const minutes = minsMatch ? toNum(minsMatch[1]) : null;
    if (/\bdnd\b.*(lift|off|clear)|dnd lifted|请勿打扰.*(取消|解除)/.test(t + transcript)) return { intent: "room_status", room: r, status: "dnd_lifted", confidence: 0.85 };
    if (/inspect|check|needs a check|检查|查房/.test(t + transcript)) return { intent: "room_status", room: r, status: "inspect", confidence: 0.8 };
    if (/skip|refused|declined|不做|拒绝/.test(t + transcript)) return { intent: "room_status", room: r, status: "skipped", confidence: 0.8 };
    if (done) return { intent: "room_done", room: r, minutes: minutes != null ? Math.round(minutes) : null, confidence: minutes != null ? 0.95 : 0.8 };
    if (/\b(fault|broken|stiff|leak|leaking|noise|not working|out of order|fix|repair|ac|aircon|tap|drain|hinge|light|tv|remote)\b/.test(t) || /坏|故障|漏|修|不工作/.test(transcript)) {
      const high = /\b(guest in room|leak|no hot water|ac|aircon|not working|out of order)\b/.test(t) || /漏|没热水|不工作/.test(transcript);
      return { intent: "fault", room: r, assetId: null, assetName: null, title: `${r} · ${transcript.replace(/\b\d{3,4}\b/, "").replace(/^[\s,·-]+/, "").trim() || "fault"}`, priority: high ? "high" : "medium", confidence: 0.75 };
    }
    if (/start|starting|in progress|开始/.test(t + transcript)) return { intent: "room_status", room: r, status: "in_progress", confidence: 0.8 };
  }

  // fault on an asset: "Lift B door sensor fault", "chiller 1 pressure"
  const asset = ctx.assets?.length ? matchStation(transcript, ctx.assets.map((a) => ({ id: a.id, name: a.name, slug: a.name.toLowerCase().replace(/\s+/g, "_"), aliases: a.aliases }))) : null;
  if (asset && (/\b(fault|broken|down|offline|out of service|noise|leak|pressure|alarm|back in service|back online|fixed)\b/.test(t) || /坏|故障|停|修好|恢复/.test(transcript))) {
    const resolved = /back in service|back online|fixed|修好|恢复/.test(t + transcript);
    return { intent: "fault", room: null, assetId: asset.station.id, assetName: asset.station.name, title: `${asset.station.name} · ${resolved ? "back in service" : transcript.replace(new RegExp(asset.station.name, "i"), "").replace(/^[\s,·-]+/, "").trim() || "fault"}`, priority: /guest|lift|no hot water|alarm/.test(t) ? "high" : "medium", confidence: 0.75 };
  }

  // waste: "<station> over-prep 2 kg" · "<station> 多备 两公斤" · "2 kilos plate waste at bakery"
  const kgMatch = t.match(new RegExp(`${NUM}\\s*(kg|kgs|kilo|kilos|kilogram|kilograms)\\b`)) ?? transcript.match(/([零一二两兩三四五六七八九十半点點\d.]+)\s*(公斤|千克|kg)/i);
  const gMatch = t.match(new RegExp(`${NUM}\\s*(g|grams?)\\b`)) ?? transcript.match(/([零一二两兩三四五六七八九十半\d.]+)\s*克/);
  const station = matchStation(transcript, ctx.stations);
  const wasteWords = /\b(waste|wasted|over[- ]?prep|overprepped|left|leftover|thrown|binned|bin|spoil|spoiled|plate waste|trim)\b/.test(t) || /浪费|多备|剩|倒掉|丢|扔|变质|过量/.test(transcript);
  if (kgMatch || gMatch || (station && wasteWords)) {
    let kg = kgMatch ? toNum(kgMatch[1]) : gMatch ? (toNum(gMatch[1]) ?? 0) / 1000 : null;
    if (kg != null) kg = Math.round(kg * 100) / 100;
    const reason = /over[- ]?prep|overprepped|多备|过量/.test(t + transcript) ? "over-prep" : /plate|剩|客人/.test(t + transcript) ? "plate waste" : /spoil|变质/.test(t + transcript) ? "spoilage" : /trim/.test(t) ? "trim" : null;
    return { intent: "waste", stationId: station?.station.id ?? null, stationName: station?.station.name ?? null, kg, reason, confidence: station && kg != null ? 0.92 : 0.55 };
  }

  // station ready: "eggs ready", "mark western hot prepped"
  if (station && (/\b(ready|prepped|set|done|up)\b/.test(t) || /准备好|好了|就绪/.test(transcript))) {
    return { intent: "station_ready", stationId: station.station.id, stationName: station.station.name, confidence: 0.85 };
  }

  return { intent: "unknown", confidence: 0 };
}
