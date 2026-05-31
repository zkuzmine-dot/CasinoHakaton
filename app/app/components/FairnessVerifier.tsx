"use client";

import { useState } from "react";
import { sha256 } from "@noble/hashes/sha256";

function deriveCrashPoint(seedHex: string, roundId: string): number | null {
  try {
    const seed = Uint8Array.from(Buffer.from(seedHex, "hex"));
    const roundIdNum = BigInt(roundId);
    const roundIdBytes = new Uint8Array(8);
    new DataView(roundIdBytes.buffer).setBigUint64(0, roundIdNum, true);

    const hash = sha256(new Uint8Array([...seed, ...roundIdBytes]));
    const commitment = Buffer.from(hash).toString("hex");

    const vrfU64 = new DataView(hash.buffer).getBigUint64(0, true);
    const MAX = BigInt("18446744073709551615");
    const x100 = (BigInt(97) * MAX) / (MAX - vrfU64);
    const clamped = x100 > BigInt(10000) ? BigInt(10000) : x100;
    const final_ = clamped < BigInt(100) ? BigInt(100) : clamped;

    return Number(final_) / 100;
  } catch {
    return null;
  }
}

export default function FairnessVerifier() {
  const [seed, setSeed] = useState("");
  const [roundId, setRoundId] = useState("");
  const [result, setResult] = useState<{ crash: number; commitment: string } | null>(null);
  const [error, setError] = useState("");

  const verify = () => {
    setError("");
    setResult(null);

    if (!seed || !roundId) {
      setError("Enter both seed and round ID");
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
      setError("Seed must be 64 hex characters (32 bytes)");
      return;
    }

    const crash = deriveCrashPoint(seed, roundId);
    if (crash === null) {
      setError("Invalid input");
      return;
    }

    // Recompute commitment
    const seedBytes = Uint8Array.from(Buffer.from(seed, "hex"));
    const roundIdBytes = new Uint8Array(8);
    new DataView(roundIdBytes.buffer).setBigUint64(0, BigInt(roundId), true);
    const hash = sha256(new Uint8Array([...seedBytes, ...roundIdBytes]));
    const commitment = Buffer.from(hash).toString("hex");

    setResult({ crash, commitment });
  };

  return (
    <div className="bg-[#1a1d26] border border-gray-800 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-white font-bold text-sm mb-1">Verify Round Fairness</h3>
        <p className="text-gray-500 text-xs">
          Enter the revealed seed and round ID to independently verify any crash point.
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">VRF Seed (hex, 64 chars)</label>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value.trim())}
            placeholder="e.g. a1b2c3d4..."
            className="w-full bg-[#0d0f14] border border-gray-700 rounded px-3 py-2 text-white text-xs font-mono
                       focus:outline-none focus:border-[#00ff88]/60 placeholder:text-gray-700"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Round ID</label>
          <input
            type="text"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value.trim())}
            placeholder="e.g. 1748710234567"
            className="w-full bg-[#0d0f14] border border-gray-700 rounded px-3 py-2 text-white text-xs font-mono
                       focus:outline-none focus:border-[#00ff88]/60 placeholder:text-gray-700"
          />
        </div>
      </div>

      <button
        onClick={verify}
        className="w-full py-2 rounded bg-[#00ff88]/10 border border-[#00ff88]/40 text-[#00ff88] text-sm font-semibold
                   hover:bg-[#00ff88]/20 transition"
      >
        Verify
      </button>

      {error && (
        <p className="text-[#ff4757] text-xs">{error}</p>
      )}

      {result && (
        <div className="space-y-2 pt-1 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Crash Point</span>
            <span className="text-[#00ff88] font-bold font-mono">{result.crash.toFixed(2)}x</span>
          </div>
          <div>
            <span className="text-gray-400 text-xs block mb-1">Commitment (SHA-256)</span>
            <span className="text-gray-300 text-[10px] font-mono break-all leading-relaxed">
              {result.commitment}
            </span>
          </div>
          <p className="text-gray-500 text-xs">
            Compare commitment with what was stored on-chain before the round started —
            if they match, the crash point is provably fair.
          </p>
        </div>
      )}

      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer hover:text-gray-400 transition">How it works</summary>
        <div className="mt-2 space-y-1 text-gray-500">
          <p>1. Before round: <code className="text-gray-400">commitment = SHA256(seed + round_id)</code> stored on-chain</p>
          <p>2. Round plays — seed stays secret</p>
          <p>3. After crash: seed revealed on-chain</p>
          <p>4. Crash formula: <code className="text-gray-400">97 × MAX_U64 / (MAX_U64 − vrf_u64)</code></p>
          <p>5. House edge = 3% baked into the formula</p>
        </div>
      </details>
    </div>
  );
}
