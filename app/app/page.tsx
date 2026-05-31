"use client";

import { useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useGame, prepareRound } from "./hooks/useGame";
import { useCasino } from "./hooks/useCasino";
import { useGameStore } from "./store/gameStore";

// Dynamic imports for wallet-dependent components
const WalletButton = dynamic(() => import("./components/WalletButton"), { ssr: false });
const BetPanel = dynamic(() => import("./components/BetPanel"), { ssr: false });
const CrashChart = dynamic(() => import("./components/CrashChart"), { ssr: false });
const MultiplierDisplay = dynamic(() => import("./components/MultiplierDisplay"), { ssr: false });
const RoundHistory = dynamic(() => import("./components/RoundHistory"), { ssr: false });
const FairnessVerifier = dynamic(() => import("./components/FairnessVerifier"), { ssr: false });
const TransactionToasts = dynamic(() => import("./components/TransactionToast"), { ssr: false });

export default function HomePage() {
  const wallet = useWallet();
  const game = useGame();
  const casino = useCasino();
  const store = useGameStore();

  const phase = store.phase;

  /**
   * Called by BetPanel after a bet is placed on-chain.
   * Starts the round countdown + flying animation.
   */
  const handleRoundStart = useCallback(
    (seed: Uint8Array, roundId: number) => {
      const cleanup = game.startRound(seed, roundId, async (cashoutMultiplier) => {
        // Auto-cashout triggered by game loop
        if (!wallet.publicKey) return;
        const cashoutX100 = Math.floor(cashoutMultiplier * 100);
        await casino.cashout(roundId, cashoutX100);

        const currentBet = store.currentBet ?? 0;
        const payout = currentBet * cashoutMultiplier * 0.97;
        store.addToast({
          type: "success",
          message: `Auto cashed out at ${cashoutMultiplier.toFixed(2)}x — won ${payout.toFixed(4)} SOL`,
        });

        // Settle on-chain (demo: frontend settles since no backend crank)
        const { seed: roundSeed } = prepareRound(roundId); // same seed used at bet time
        // Note: in production, seed would come from server; here we reconstruct
        await casino.settleRound(
          roundId,
          cashoutX100,
          roundSeed,
          wallet.publicKey
        );
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

  // After crash: auto-settle and restart after 4 seconds
  useEffect(() => {
    if (phase !== "crashed") return;

    const timer = setTimeout(() => {
      store.resetRound();
    }, 4000);

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
      <div className="px-6 pb-6 bg-[#0a0c10]">
        <FairnessVerifier />
      </div>

      {/* Toasts */}
      <TransactionToasts />
    </main>
  );
}
