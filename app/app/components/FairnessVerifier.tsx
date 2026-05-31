"use client";

import { useState } from "react";
import { sha256 } from "@noble/hashes/sha256";
import { useGameStore, RoundResult } from "../store/gameStore";

function verify(result: RoundResult): { commitment: string; derived: number } | null {
  if (!result.vrfSeedHex) return null;
  try {
    const seed = Uint8Array.from(Buffer.from(result.vrfSeedHex, "hex"));
    const roundIdBytes = new Uint8Array(8);
    new DataView(roundIdBytes.buffer).setBigUint64(0, BigInt(result.roundId), true);
    const combined = new Uint8Array([...seed, ...roundIdBytes]);
    const hash = sha256(combined);
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

export default function FairnessVerifier() {
  const history = useGameStore((s) => s.history);
  const [selected, setSelected] = useState<RoundResult | null>(null);
  const result = selected ? verify(selected) : null;

  const verifiable = history.filter((r) => r.vrfSeedHex);

  return (
    <div className="bg-[#1a1d26] border border-gray-800 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-white font-bold text-sm">Provably Fair Verification</h3>
        <p className="text-gray-500 text-xs mt-0.5">
          Select any round to verify its crash point is derived fairly from the VRF seed.
        </p>
      </div>

      {verifiable.length === 0 ? (
        <p className="text-gray-600 text-xs">No rounds played yet — play a round to verify fairness.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {verifiable.map((r) => (
            <button
              key={r.roundId}
              onClick={() => setSelected(r)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition border
                ${selected?.roundId === r.roundId
                  ? "bg-[#00ff88]/20 border-[#00ff88] text-[#00ff88]"
                  : "bg-[#0d0f14] border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
            >
              #{r.roundId.toString().slice(-6)} · {r.crashPoint.toFixed(2)}x
            </button>
          ))}
        </div>
      )}

      {selected && result && (
        <div className="space-y-3 pt-3 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block mb-1">Round ID</span>
              <span className="text-white font-mono">{selected.roundId}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Crash Point</span>
              <span className="text-[#00ff88] font-bold font-mono">{selected.crashPoint.toFixed(2)}x</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Derived from seed</span>
              <span className={`font-bold font-mono ${
                Math.abs(result.derived - selected.crashPoint) < 0.01 ? "text-[#00ff88]" : "text-[#ff4757]"
              }`}>
                {result.derived.toFixed(2)}x{" "}
                {Math.abs(result.derived - selected.crashPoint) < 0.01 ? "✓ match" : "✗ mismatch"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">VRF Seed (hex)</span>
              <span className="text-gray-400 font-mono text-[9px] break-all">{selected.vrfSeedHex?.slice(0, 24)}…</span>
            </div>
          </div>

          <div>
            <span className="text-gray-500 text-xs block mb-1">SHA-256 Commitment</span>
            <span className="text-gray-400 text-[9px] font-mono break-all leading-relaxed">{result.commitment}</span>
          </div>

          <p className="text-gray-600 text-[10px]">
            Formula: crash = 97 × U64_MAX / (U64_MAX − vrf_u64) · House edge 3% is baked in mathematically.
          </p>
        </div>
      )}

      {selected && !result && (
        <p className="text-[#ff4757] text-xs">Seed not available for this round.</p>
      )}
    </div>
  );
}
