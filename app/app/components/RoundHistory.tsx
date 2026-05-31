"use client";

import { useState } from "react";
import { sha256 } from "@noble/hashes/sha256";
import { useGameStore, RoundResult } from "../store/gameStore";

function verifySeed(result: RoundResult) {
  if (!result.vrfSeedHex) return null;
  try {
    const seed = Uint8Array.from(Buffer.from(result.vrfSeedHex, "hex"));
    const roundIdBytes = new Uint8Array(8);
    new DataView(roundIdBytes.buffer).setBigUint64(0, BigInt(result.roundId), true);
    const hash = sha256(new Uint8Array([...seed, ...roundIdBytes]));
    const commitment = Buffer.from(hash).toString("hex");
    const vrfU64 = new DataView(hash.buffer).getBigUint64(0, true);
    const MAX = BigInt("18446744073709551615");
    const x100 = (BigInt(97) * MAX) / (MAX - vrfU64);
    const clamped = x100 > BigInt(10000) ? BigInt(10000) : x100;
    const derived = Number(clamped < BigInt(100) ? BigInt(100) : clamped) / 100;
    return { commitment, derived };
  } catch {
    return null;
  }
}

function Badge({ result, onClick }: { result: RoundResult; onClick: () => void }) {
  const cp = result.crashPoint;
  const won = result.won;

  let color = "text-gray-400 bg-gray-800/60 border-gray-700/60";
  if (won) color = "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/30";
  else if (cp < 1.5) color = "text-[#ff4757] bg-[#ff4757]/10 border-[#ff4757]/30";
  else if (cp >= 10) color = "text-yellow-400 bg-yellow-900/20 border-yellow-700/30";

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold border
                  transition hover:brightness-125 active:scale-95 cursor-pointer ${color}`}
    >
      {!won && cp < 1.2 ? "💥" : won ? "✓" : ""}
      {cp.toFixed(2)}x
    </button>
  );
}

function Modal({ result, onClose }: { result: RoundResult; onClose: () => void }) {
  const proof = verifySeed(result);
  const matches = proof && Math.abs(proof.derived - result.crashPoint) < 0.02;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1d26] border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">Round #{String(result.roundId).slice(-8)}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Result summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d0f14] rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Crash Point</div>
            <div className="text-[#ff4757] font-black text-xl font-mono">{result.crashPoint.toFixed(2)}x</div>
          </div>
          {result.cashedOutAt ? (
            <div className="bg-[#0d0f14] rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Cashed Out</div>
              <div className="text-[#00ff88] font-black text-xl font-mono">{result.cashedOutAt.toFixed(2)}x</div>
            </div>
          ) : (
            <div className="bg-[#0d0f14] rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Result</div>
              <div className="text-[#ff4757] font-bold text-sm">Lost</div>
            </div>
          )}
        </div>

        {/* Provably fair section */}
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm font-semibold">Provably Fair</span>
            {proof ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                matches ? "text-[#00ff88] bg-[#00ff88]/10" : "text-[#ff4757] bg-[#ff4757]/10"
              }`}>
                {matches ? "✓ Verified" : "✗ Mismatch"}
              </span>
            ) : (
              <span className="text-gray-600 text-xs">Seed not available</span>
            )}
          </div>

          {proof && (
            <>
              <div>
                <div className="text-gray-500 text-xs mb-1">Derived crash from seed</div>
                <div className="text-white font-mono text-sm">{proof.derived.toFixed(2)}x</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">VRF Seed (hex)</div>
                <div className="text-gray-400 font-mono text-[10px] break-all leading-relaxed bg-[#0d0f14] p-2 rounded">
                  {result.vrfSeedHex}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">SHA-256 Commitment</div>
                <div className="text-gray-500 font-mono text-[10px] break-all leading-relaxed bg-[#0d0f14] p-2 rounded">
                  {proof.commitment}
                </div>
              </div>
            </>
          )}

          <p className="text-gray-600 text-[10px]">
            Formula: <span className="font-mono">crash = 97 × MAX_U64 / (MAX_U64 − vrf_u64)</span> · 3% house edge baked in.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RoundHistory() {
  const history = useGameStore((s) => s.history);
  const [selected, setSelected] = useState<RoundResult | null>(null);

  if (history.length === 0) {
    return (
      <div className="flex items-center gap-3 overflow-x-auto py-1">
        <span className="text-gray-600 text-xs whitespace-nowrap">Recent rounds:</span>
        <span className="text-gray-700 text-xs">No rounds yet</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
        <span className="text-gray-500 text-xs whitespace-nowrap shrink-0">Recent:</span>
        {history.map((r) => (
          <Badge
            key={`${r.roundId}-${r.crashPoint}`}
            result={r}
            onClick={() => setSelected(r)}
          />
        ))}
      </div>

      {selected && (
        <Modal result={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
