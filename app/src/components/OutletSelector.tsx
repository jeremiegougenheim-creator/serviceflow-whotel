"use client";

import { useState } from "react";
import { useOutlet } from "@/context/OutletContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function OutletSelector({ open, onClose }: Props) {
  const { outlets, selectedOutlet, setSelectedOutlet } = useOutlet();
  const [showComingSoon, setShowComingSoon] = useState(false);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(42,37,32,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-lauds-cream rounded-t-3xl z-50 pb-safe shadow-lauds-elevated">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-lauds-border" />
        </div>

        <div className="px-5 pt-2 pb-8">
          {/* Property label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 border border-lauds-champagne/60 rounded-md flex items-center justify-center">
              <span className="font-serif text-sm font-medium text-lauds-champagne leading-none">S</span>
            </div>
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-lauds-charcoal/70">
              W Taipei · Xinyi
            </p>
          </div>

          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-muted mb-3">
            Select outlet
          </p>

          <div className="space-y-2">
            {outlets.map((outlet) => {
              const isSelected = outlet.id === selectedOutlet.id;
              const isLive = outlet.status === "live";

              return (
                <button
                  key={outlet.id}
                  onClick={() => {
                    if (!isLive) {
                      setShowComingSoon(true);
                      return;
                    }
                    setSelectedOutlet(outlet);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors active:opacity-80"
                  style={
                    isSelected
                      ? {
                          background: "color-mix(in srgb, var(--lauds-accent-action) 8%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--lauds-accent-action) 20%, transparent)",
                        }
                      : {
                          background: "rgba(224,217,207,0.07)",
                          border: "1px solid rgba(228,221,210,0.6)",
                        }
                  }
                >
                  {/* ● / ○ selection indicator */}
                  <span className="flex-shrink-0 flex items-center justify-center w-4 h-4">
                    {isSelected ? (
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ background: "var(--lauds-accent-action)" }}
                      />
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-full border-[1.5px]"
                        style={{ borderColor: "var(--lauds-divider)" }}
                      />
                    )}
                  </span>

                  {/* Outlet name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[14px] font-medium leading-tight ${
                        isLive ? "text-lauds-charcoal" : "text-lauds-muted"
                      }`}
                    >
                      {outlet.name}
                    </p>
                  </div>

                  {/* Badge: LIVE or timeline date */}
                  {isLive ? (
                    <span
                      className="text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full flex-shrink-0"
                      style={{
                        color: "var(--lauds-accent-action)",
                        background: "color-mix(in srgb, var(--lauds-accent-action) 10%, transparent)",
                      }}
                    >
                      Live
                    </span>
                  ) : (
                    <span
                      className="text-[10px] font-semibold tracking-[0.1em] px-2.5 py-1 rounded-full flex-shrink-0"
                      style={{
                        color: "var(--lauds-text-muted)",
                        background: "color-mix(in srgb, var(--lauds-divider) 15%, transparent)",
                      }}
                    >
                      {outlet.timeline ?? "Soon"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Coming-soon overlay */}
        {showComingSoon && (
          <div className="absolute inset-0 bg-lauds-cream rounded-t-3xl flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="font-serif text-2xl font-medium text-lauds-charcoal">
              Bientôt disponible
            </p>
            <p className="text-[13px] text-lauds-muted leading-relaxed">
              This outlet is on the roadmap for the W Taipei pilot.
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="mt-2 text-[13px] font-semibold tracking-[0.06em] text-lauds-blue"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </>
  );
}
