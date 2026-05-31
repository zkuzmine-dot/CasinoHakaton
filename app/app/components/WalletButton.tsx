"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";
import { useCasino } from "../hooks/useCasino";

export default function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const walletBalance = useGameStore((s) => s.walletBalance);
  const { refreshBalances } = useCasino();

  useEffect(() => {
    if (connected) {
      refreshBalances();
      const interval = setInterval(refreshBalances, 15000);
      return () => clearInterval(interval);
    }
  }, [connected, refreshBalances]);

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="px-5 py-2 rounded-lg bg-[#00ff88] text-black font-bold text-sm
                   hover:bg-[#00dd77] transition-all shadow-[0_0_20px_rgba(0,255,136,0.3)]"
      >
        Connect Wallet
      </button>
    );
  }

  const shortAddr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : "";

  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden sm:block">
        <div className="text-xs text-gray-500">Wallet</div>
        <div className="text-sm text-white font-mono">{walletBalance.toFixed(3)} SOL</div>
      </div>
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-mono
                   hover:border-[#ff4757] hover:text-[#ff4757] transition-all"
        title="Click to disconnect"
      >
        {shortAddr}
      </button>
    </div>
  );
}
