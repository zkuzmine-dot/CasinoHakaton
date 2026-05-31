"use client";

import { useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useGame } from "./hooks/useGame";
import { useCasino } from "./hooks/useCasino";
import { useGameStore } from "./store/gameStore";

// Dynamic imports for wallet-dependent components
const WalletButton = dynamic(() => import("./components/WalletButton"), { ssr: false });
const BetPanel = dynamic(() => import("./components/BetPanel"), { ssr: false });
const CrashChart = dynamic(() => import("./components/CrashChart"), { ssr: false });
const MultiplierDisplay = dynamic(() => import("./components/MultiplierDisplay"), { ssr: false });
const RoundHistory = dynamic(() => import("./components/RoundHistory"), { ssr: false });

const TransactionToasts = dynamic(() => import("./components/TransactionToast"), { ssr: false });

export default function HomePage() {
  const wallet = useWallet();
  const game = useGame();
  const casino = useCasino();
  const store = useGameStore();

  const phase = store.phase;
  const multiplier = store.multiplier;
  const currentBet = store.currentBet;
  const isFlying = phase === "flying";

  /**
   * Called by BetPanel after a bet is placed on-chain.
   * Starts the round countdown + flying animation.
   */
  const handleRoundStart = useCallback(
    (seed: Uint8Array, roundId: number) => {
      // Capture seed at round start — used for on-chain settle later
      const capturedSeed = seed;

      const cleanup = game.startRound(seed, roundId, async (cashoutMultiplier) => {
        if (!wallet.publicKey) return;
        const cashoutX100 = Math.floor(cashoutMultiplier * 100);

        const currentBet = store.currentBet ?? 0;
        const payout = currentBet * cashoutMultiplier * 0.97;
        store.addToast({
          type: "success",
          message: `Auto cashed out at ${cashoutMultiplier.toFixed(2)}x — won ${payout.toFixed(4)} SOL`,
        });

        // Use the original seed from this round — not a new one
        await casino.settleRound(roundId, cashoutX100, capturedSeed, wallet.publicKey);
        await casino.refreshBalances();
      });

      return cleanup;
    },
    [game, casino, wallet.publicKey, store]
  );

  // Auto-refresh balances when wallet connects
  useEffect(() => {
    if (wallet.connected) casino.refreshBalances();
  }, [wallet.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset round after crash (4s) or after cashout (3s) → allows placing new bet
  useEffect(() => {
    if (phase !== "crashed" && phase !== "cashed_out") return;

    const delay = phase === "crashed" ? 4000 : 3000;
    const timer = setTimeout(() => {
      store.resetRound();
    }, delay);

    return () => clearTimeout(timer);
  }, [phase, store]);

  const isCrashed = phase === "crashed";

  return (
    <main className="min-h-screen bg-[#0d0f14] text-white flex flex-col">
      {/* Crash flash overlay */}
      {isCrashed && (
        <div className="fixed inset-0 pointer-events-none z-10 animate-crash-flash" />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00ff88] to-[#00aaff] flex items-center justify-center">
            <span className="text-black font-black text-xs">CR</span>
          </div>
          <span className="font-bold text-lg tracking-tight">
            CRASH<span className="text-[#00ff88]">.</span>SOL
          </span>
          <span className="hidden sm:inline text-xs text-gray-600 border border-gray-800 px-2 py-0.5 rounded">
            DEVNET
          </span>
        </div>
        <WalletButton />
      </header>

      {/* Main game area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Chart + multiplier */}
        <div className="flex-1 relative min-h-[300px] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-gray-800/60">
          <CrashChart />
          <MultiplierDisplay />

          {/* Provably fair indicator */}
          {store.roundSeed && (
            <div className="absolute bottom-2 left-2 text-[10px] text-gray-600 font-mono hidden sm:block">
              Round #{store.roundId} · Provably Fair
            </div>
          )}
        </div>

        {/* Bet panel */}
        <div className="w-full lg:w-80 p-5 shrink-0">
          <BetPanel onRoundStart={handleRoundStart} />
        </div>
      </div>

      {/* Round history + fairness verifier */}
      <div className="px-6 py-3 border-t border-gray-800/60 bg-[#0a0c10]">
        <RoundHistory />
      </div>

      {/* Floating CASH OUT button — fixed bottom center, always on top, large tap target */}
      {isFlying && (
        <button
          onClick={async () => {
            const m = game.cashOut();
            if (!m) return;
            const payout = (currentBet ?? 0) * m * 0.97;
            store.addToast({
              type: "success",
              message: `Cashed out at ${m.toFixed(2)}x — won ${payout.toFixed(4)} SOL`,
            });
            if (wallet.publicKey) {
              casino.cashout(store.roundId, Math.floor(m * 100));
            }
          }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50
                     px-10 py-5 text-2xl font-black rounded-2xl
                     bg-[#00ff88] text-black
                     shadow-[0_0_40px_rgba(0,255,136,0.7)]
                     animate-pulse-subtle
                     active:scale-95 transition-transform
                     select-none"
          style={{ minWidth: 280, touchAction: "manipulation" }}
        >
          CASH OUT {multiplier.toFixed(2)}x
        </button>
      )}

      {/* Toasts */}
      <TransactionToasts />
    </main>
  );
}
