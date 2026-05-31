"use client";

import { useGameStore, GamePhase } from "../store/gameStore";

function getLabel(phase: GamePhase, multiplier: number, crashPoint: number | null): string {
  switch (phase) {
    case "idle": return "Place your bet";
    case "waiting": return "Round starting...";
    case "flying": return `${multiplier.toFixed(2)}x`;
    case "crashed": return `${crashPoint?.toFixed(2) ?? multiplier.toFixed(2)}x`;
    case "cashed_out": return `${multiplier.toFixed(2)}x`;
    case "tx_pending": return "Confirming...";
    default: return "1.00x";
  }
}

function getColor(phase: GamePhase): string {
  if (phase === "crashed") return "text-[#ff4757]";
  if (phase === "cashed_out") return "text-[#00ff88]";
  if (phase === "flying") return "text-[#00ff88]";
  return "text-gray-400";
}

function getSublabel(phase: GamePhase, crashPoint: number | null, cashedOutAt: number | null): string | null {
  if (phase === "crashed") return "CRASHED";
  if (phase === "cashed_out" && cashedOutAt) return `CASHED OUT at ${cashedOutAt.toFixed(2)}x`;
  if (phase === "waiting") return "5 seconds...";
  return null;
}

export default function MultiplierDisplay() {
  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const crashPoint = useGameStore((s) => s.crashPoint);
  const cashedOutAt = useGameStore((s) => s.cashedOutAt);
  const txMsg = useGameStore((s) => s.txPendingMessage);

  const label = getLabel(phase, multiplier, crashPoint);
  const color = getColor(phase);
  const sublabel = getSublabel(phase, crashPoint, cashedOutAt);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      {phase === "tx_pending" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">{txMsg || "Confirming on Solana..."}</p>
        </div>
      ) : (
        <>
          <div
            className={`text-6xl md:text-8xl font-black tabular-nums tracking-tight ${color}
                        transition-colors duration-200
                        ${phase === "crashed" ? "animate-shake" : ""}
                        ${phase === "flying" ? "drop-shadow-[0_0_20px_rgba(0,255,136,0.6)]" : ""}`}
            style={{
              textShadow:
                phase === "flying"
                  ? "0 0 40px rgba(0,255,136,0.4)"
                  : phase === "crashed"
                  ? "0 0 40px rgba(255,71,87,0.6)"
                  : undefined,
            }}
          >
            {label}
          </div>
          {sublabel && (
            <div
              className={`mt-2 text-sm font-semibold tracking-widest uppercase ${
                phase === "crashed" ? "text-[#ff4757]" : "text-[#00ff88]"
              }`}
            >
              {sublabel}
            </div>
          )}
        </>
      )}
    </div>
  );
}
