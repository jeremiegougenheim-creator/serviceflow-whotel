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

        <div className="px-5 pt-3 pb-8">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-muted mb-4">
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
                  className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors active:opacity-80"
                  style={
                    isSelected
                      ? {
                          background: "rgba(43,91,219,0.08)",
                          border: "1px solid rgba(43,91,219,0.2)",
                        }
                      : {
                          background: "rgba(224,217,207,0.07)",
                          border: "1px solid rgba(228,221,210,0.6)",
                        }
                  }
                >
                  <div className="flex-1">
                    <p
                      className={`text-[14px] font-medium ${
                        isLive ? "text-lauds-charcoal" : "text-lauds-muted"
                      }`}
                    >
                      {outlet.name}
                    </p>
                  </div>

                  {isLive ? (
                    <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-lauds-blue bg-lauds-blue/10 px-2.5 py-1 rounded-full">
                      Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-lauds-muted bg-lauds-border/40 px-2.5 py-1 rounded-full">
                      Soon
                    </span>
                  )}

                  {isSelected && isLive && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      className="w-4 h-4 text-lauds-blue flex-shrink-0"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
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
              This outlet will be available in a future release of the W Taipei pilot.
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
