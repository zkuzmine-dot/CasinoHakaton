"use client";

import { useGameStore, RoundResult } from "../store/gameStore";

function CrashBadge({ result }: { result: RoundResult }) {
  const isCrashed = !result.won && !result.cashedOutAt;
  const isWon = result.won;
  const cp = result.crashPoint;

  let color = "text-gray-400 bg-gray-900";
  if (isCrashed && cp < 1.5) color = "text-[#ff4757] bg-[#ff4757]/10 border border-[#ff4757]/30";
  else if (cp >= 10) color = "text-yellow-400 bg-yellow-900/20 border border-yellow-700/30";
  else if (cp >= 3) color = "text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/30";

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold ${color}`}>
      {isCrashed && cp < 1.2 ? "💥" : ""}
      {cp.toFixed(2)}x
    </span>
  );
}

export default function RoundHistory() {
  const history = useGameStore((s) => s.history);

  if (history.length === 0) {
    return (
      <div className="flex items-center gap-3 overflow-x-auto py-1">
        <span className="text-gray-600 text-xs whitespace-nowrap">Recent rounds:</span>
        <span className="text-gray-700 text-xs">No rounds played yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
      <span className="text-gray-500 text-xs whitespace-nowrap shrink-0">Recent:</span>
      {history.map((r) => (
        <CrashBadge key={`${r.roundId}-${r.crashPoint}`} result={r} />
      ))}
    </div>
  );
}
