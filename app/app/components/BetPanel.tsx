"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useGameStore } from "../store/gameStore";
import { useCasino } from "../hooks/useCasino";
import { prepareRound } from "../hooks/useGame";

const PRESET_BETS = [0.05, 0.1, 0.25, 0.5, 1.0];

interface Props {
  onRoundStart: (seed: Uint8Array, roundId: number) => void;
}

export default function BetPanel({ onRoundStart }: Props) {
  const wallet = useWallet();
  const store = useGameStore();
  const casino = useCasino();
  const [depositAmount, setDepositAmount] = useState("0.5");
  const [showDeposit, setShowDeposit] = useState(false);
  const [autoCashout, setAutoCashout] = useState("");

  const phase = store.phase;
  const betAmount = store.betAmount;
  const casinoBalance = store.casinoBalance;

  const canBet =
    wallet.connected &&
    (phase === "idle" || phase === "waiting") &&
    casinoBalance >= betAmount;

  const handlePlaceBet = useCallback(async () => {
    if (!wallet.publicKey || !canBet) return;

    const roundId = Date.now(); // simple round ID using timestamp
    const { seed, commitment } = prepareRound(roundId);

    const sig = await casino.placeBet(betAmount, roundId, commitment);
    if (!sig) return;

    store.setAutoCashout(autoCashout ? parseFloat(autoCashout) : null);
    onRoundStart(seed, roundId);
  }, [wallet.publicKey, canBet, casino, betAmount, store, autoCashout, onRoundStart]);

  const handleDeposit = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    await casino.deposit(amount);
    setShowDeposit(false);
  }, [casino, depositAmount]);

  const handleWithdraw = useCallback(async () => {
    if (casinoBalance <= 0) return;
    await casino.withdraw(casinoBalance);
  }, [casino, casinoBalance]);

  if (!wallet.connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 text-sm">Connect wallet to play</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Balance row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          Casino Balance:{" "}
          <span className="text-white font-semibold">{casinoBalance.toFixed(4)} SOL</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDeposit(!showDeposit)}
            className="px-3 py-1 text-xs rounded border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/10 transition"
          >
            Deposit
          </button>
          <button
            onClick={handleWithdraw}
            disabled={casinoBalance <= 0 || phase === "flying"}
            className="px-3 py-1 text-xs rounded border border-gray-600 text-gray-400 hover:border-gray-400 transition disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Deposit panel */}
      {showDeposit && (
        <div className="flex gap-2">
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="flex-1 bg-[#1a1d26] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ff88]/60"
          />
          <button
            onClick={handleDeposit}
            className="px-4 py-2 bg-[#00ff88] text-black text-sm font-bold rounded hover:bg-[#00dd77] transition"
          >
            Confirm
          </button>
        </div>
      )}

      <hr className="border-gray-800" />

      {/* Bet amount selector */}
      <div>
        <label className="text-xs text-gray-500 mb-2 block">Bet Amount</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {PRESET_BETS.map((preset) => (
            <button
              key={preset}
              onClick={() => store.setBetAmount(preset)}
              disabled={phase === "flying"}
              className={`px-3 py-1.5 text-xs rounded font-medium transition disabled:opacity-40 ${
                betAmount === preset
                  ? "bg-[#00ff88] text-black"
                  : "bg-[#1a1d26] text-gray-300 hover:bg-[#252836]"
              }`}
            >
              {preset} SOL
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            type="number"
            min="0.01"
            max="1"
            step="0.01"
            value={betAmount}
            onChange={(e) => store.setBetAmount(parseFloat(e.target.value) || 0.1)}
            disabled={phase === "flying"}
            className="w-full bg-[#1a1d26] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ff88]/60 disabled:opacity-40"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
            SOL
          </span>
        </div>
      </div>

      {/* Auto cashout */}
      <div>
        <label className="text-xs text-gray-500 mb-2 block">
          Auto Cash Out at (optional)
        </label>
        <div className="relative">
          <input
            type="number"
            min="1.01"
            step="0.1"
            placeholder="e.g. 2.00"
            value={autoCashout}
            onChange={(e) => setAutoCashout(e.target.value)}
            disabled={phase === "flying"}
            className="w-full bg-[#1a1d26] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ff88]/60 disabled:opacity-40 placeholder:text-gray-600"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
            x
          </span>
        </div>
      </div>

      {/* Action button — cash out is handled by the floating button in page.tsx */}
      <div className="mt-auto">
        <button
          onClick={handlePlaceBet}
          disabled={!canBet}
          className="w-full py-4 text-lg font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed
                     bg-[#1a2a1a] border-2 border-[#00ff88]/60 text-[#00ff88]
                     hover:bg-[#00ff88]/10 hover:border-[#00ff88]
                     enabled:shadow-[0_0_15px_rgba(0,255,136,0.15)]"
        >
          {phase === "tx_pending"
            ? "Confirming..."
            : phase === "waiting"
            ? "Round starting..."
            : phase === "flying"
            ? "Round in progress"
            : phase === "cashed_out"
            ? "Cashed out — wait for next round"
            : "Place Bet"}
        </button>
      </div>
    </div>
  );
}
