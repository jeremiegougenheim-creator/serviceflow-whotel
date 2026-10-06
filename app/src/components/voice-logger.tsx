"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { applyVoice, previewVoice, type VoicePreview } from "@/lib/actions/voice";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognizer(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LANGS: [string, string][] = [
  ["en-GB", "EN"],
  ["zh-HK", "粵"],
  ["zh-CN", "中"],
];

/**
 * "Log a station, in English or Chinese." Speech in the browser when it is available, typed text
 * otherwise. The parsed line is shown back and written only when the person confirms.
 */
export function VoiceLogger({ propertyId, outletId, serviceDate, department, placeholder, examples }: { propertyId: string; outletId: string | null; serviceDate: string; department: "kitchen" | "housekeeping" | "engineering"; placeholder: string; examples: string[] }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en-GB");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const checked = useRef(false);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const recRef = useRef<SR | null>(null);
  const startedAt = useRef<number | null>(null);
  const viaVoice = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    // the Web Speech API exists only in the browser; read it once after mount
    const ok = !!getRecognizer();
    queueMicrotask(() => {
      setSupported(ok);
      setReady(true);
    });
  }, []);

  function listen() {
    const Rec = getRecognizer();
    if (!Rec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Rec();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results, (r) => r[0].transcript).join(" ");
      setText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    viaVoice.current = true;
    startedAt.current ??= Date.now();
    setListening(true);
    setResult(null);
    rec.start();
  }

  async function parse() {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    startedAt.current ??= Date.now();
    try {
      setPreview(await previewVoice({ transcript: text.trim(), propertyId, outletId, serviceDate, department }));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      const seconds = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : null;
      const r = await applyVoice(preview, { transcript: text.trim(), language: lang, source: viaVoice.current ? "voice" : "manual", secondsToLog: seconds });
      setResult(r.ok ? { ok: true, msg: r.label ?? "Logged" } : { ok: false, msg: r.error });
      if (r.ok) {
        setText("");
        setPreview(null);
        startedAt.current = null;
        viaVoice.current = false;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-raised px-3.5 py-3" data-voice-logger data-ready={ready ? "1" : undefined}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={listen} disabled={!supported} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? "bg-red text-cream" : supported ? "bg-gold text-ink" : "bg-navy text-mist"}`} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak"} title={supported ? "Speak" : "Speech is not available in this browser; type instead"}>
          <Icon name="mic" size={20} />
        </button>
        <input
          className="input !bg-ink/60"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
            startedAt.current ??= Date.now();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              parse();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button type="button" onClick={parse} disabled={busy || !text.trim()} className="btn btn-ghost !px-3.5">
          {busy && !preview ? "…" : "Log"}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {LANGS.map(([code, label]) => (
            <button key={code} type="button" onClick={() => setLang(code)} className={`pill ${lang === code ? "pill-gd" : "pill-mt"}`} aria-pressed={lang === code}>
              {label}
            </button>
          ))}
        </div>
        <span className="muted truncate text-[12px]">{listening ? "Listening…" : `“${examples[0]}”`}</span>
      </div>
      {preview ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-ink/60 px-3 py-2.5">
          <span className="text-[14px]">{preview.summary}</span>
          {preview.canApply ? (
            <button type="button" onClick={confirm} disabled={busy} className="btn btn-gold !py-2 !text-[13px]">
              {busy ? "…" : "Confirm"}
            </button>
          ) : (
            <button type="button" onClick={() => setPreview(null)} className="btn btn-ghost !py-2 !text-[13px]">
              Edit
            </button>
          )}
        </div>
      ) : null}
      {result ? (
        <p className={`mt-2 text-[13px] ${result.ok ? "text-green" : "text-red"}`} role="status">
          {result.msg}
        </p>
      ) : null}
    </div>
  );
}
