"use client";

import { useEffect, useState } from "react";
import { useGameStore, GamePhase } from "../store/gameStore";

const COUNTDOWN_SEC = 5;

function useCountdown(active: boolean): number {
  const [remaining, setRemaining] = useState(COUNTDOWN_SEC);

  useEffect(() => {
    if (!active) {
      setRemaining(COUNTDOWN_SEC);
      return;
    }

    setRemaining(COUNTDOWN_SEC);
    const start = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, Math.ceil(COUNTDOWN_SEC - elapsed));
      setRemaining(left);
    };

    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [active]);

  return remaining;
}

function getColor(phase: GamePhase): string {
  if (phase === "crashed") return "text-[#ff4757]";
  if (phase === "cashed_out") return "text-[#00ff88]";
  if (phase === "flying") return "text-[#00ff88]";
  return "text-gray-400";
}

export default function MultiplierDisplay() {
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const crashPoint = useGameStore((s) => s.crashPoint);
  const cashedOutAt = useGameStore((s) => s.cashedOutAt);
  const txMsg = useGameStore((s) => s.txPendingMessage);

  const countdown = useCountdown(phase === "waiting");
  const color = getColor(phase);

  if (phase === "tx_pending") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm mt-3">{txMsg || "Confirming on Solana..."}</p>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-4">
        <p className="text-gray-400 text-sm tracking-widest uppercase">Next round in</p>

        {/* Big countdown ring */}
        <div className="relative flex items-center justify-center">
          <svg width="120" height="120" className="-rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#1a1d26" strokeWidth="6" />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="#00ff88"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 52}`}
              strokeDashoffset={`${2 * Math.PI * 52 * (1 - countdown / COUNTDOWN_SEC)}`}
              style={{ transition: "stroke-dashoffset 0.1s linear" }}
            />
          </svg>
          <span
            className="absolute text-5xl font-black tabular-nums text-white"
            style={{ textShadow: countdown <= 2 ? "0 0 20px rgba(0,255,136,0.6)" : undefined }}
          >
            {countdown}
          </span>
        </div>

        <p className="text-gray-600 text-xs">Place your bet now!</p>
      </div>
    );
  }

  const label =
    phase === "idle" ? "Place your bet"
    : phase === "flying" ? `${multiplier.toFixed(2)}x`
    : phase === "crashed" ? `${crashPoint?.toFixed(2) ?? multiplier.toFixed(2)}x`
    : phase === "cashed_out" ? `${cashedOutAt?.toFixed(2) ?? multiplier.toFixed(2)}x`
    : "1.00x";

  const sublabel =
    phase === "crashed" ? "CRASHED"
    : phase === "cashed_out" && cashedOutAt ? `CASHED OUT at ${cashedOutAt.toFixed(2)}x`
    : null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <div
        className={`text-6xl md:text-8xl font-black tabular-nums tracking-tight ${color}
                    transition-colors duration-200
                    ${phase === "crashed" ? "animate-shake" : ""}`}
        style={{
          textShadow:
            phase === "flying" ? "0 0 40px rgba(0,255,136,0.4)"
            : phase === "crashed" ? "0 0 40px rgba(255,71,87,0.6)"
            : undefined,
        }}
      >
        {label}
      </div>

      {sublabel && (
        <div className={`mt-2 text-sm font-semibold tracking-widest uppercase ${
          phase === "crashed" ? "text-[#ff4757]" : "text-[#00ff88]"
        }`}>
          {sublabel}
        </div>
      )}
    </div>
  );
}
