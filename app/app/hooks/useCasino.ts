"use client";

import { useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getProgram,
  getCasinoPDA,
  getEscrowPDA,
  getPlayerPDA,
  getBetPDA,
  lamportsToSol,
  solToLamports,
} from "../lib/program";
import { useGameStore } from "../store/gameStore";

function humanizeError(err: unknown): string {
  const msg = String(err);
  if (msg.includes("0x1770") || msg.includes("InsufficientBalance"))
    return "Insufficient casino balance. Please deposit first.";
  if (msg.includes("0x1774") || msg.includes("BetTooSmall"))
    return "Bet must be at least 0.01 SOL.";
  if (msg.includes("0x1775") || msg.includes("BetTooLarge"))
    return "Bet cannot exceed 1 SOL.";
  if (msg.includes("User rejected"))
    return "Transaction rejected in wallet.";
  if (msg.includes("insufficient funds"))
    return "Not enough SOL in wallet for transaction fee.";
  return "Transaction failed. Please try again.";
}

export function useCasino() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const store = useGameStore();

  const getProvider = useCallback((): AnchorProvider | null => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions)
      return null;
    return new AnchorProvider(
      connection,
      wallet as never,
      { commitment: "confirmed" }
    );
  }, [connection, wallet]);

  /** Fetch on-chain casino balance and player balance */
  const refreshBalances = useCallback(async (retryMs = 0) => {
    if (!wallet.publicKey) return;

    if (retryMs > 0) {
      await new Promise((r) => setTimeout(r, retryMs));
    }

    try {
      const walletLamports = await connection.getBalance(wallet.publicKey);
      store.setWalletBalance(lamportsToSol(walletLamports));

      const provider = getProvider();
      if (!provider) return;

      const program = getProgram(provider);
      const [playerPDA] = getPlayerPDA(wallet.publicKey);

      try {
        const playerAccount = await program.account.playerAccount.fetch(playerPDA);
        store.setCasinoBalance(lamportsToSol(Number(playerAccount.balance)));
      } catch {
        store.setCasinoBalance(0);
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("429") || msg.includes("rate limit")) {
        // silently retry once after 6s
        setTimeout(() => refreshBalances(0), 6000);
        return;
      }
      console.error("refreshBalances error:", err);
    }
  }, [wallet.publicKey, connection, getProvider, store]);

  /** Deposit SOL from wallet into casino escrow */
  const deposit = useCallback(
    async (solAmount: number): Promise<boolean> => {
      const provider = getProvider();
      if (!provider || !wallet.publicKey) return false;

      store.setPhase("tx_pending");
      store.setTxPending("Depositing SOL to casino...");

      try {
        const program = getProgram(provider);
        const [casinoPDA] = getCasinoPDA();
        const [escrowPDA] = getEscrowPDA(casinoPDA);
        const [playerPDA] = getPlayerPDA(wallet.publicKey);
        const lamports = solToLamports(solAmount);

        const sig = await program.methods
          .deposit(new BN(lamports.toString()))
          .accounts({
            casinoState: casinoPDA,
            escrow: escrowPDA,
            playerAccount: playerPDA,
            player: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        store.addToast({
          type: "success",
          message: `Deposited ${solAmount} SOL`,
          txSignature: sig,
        });
        await refreshBalances();
        store.setPhase("idle");
        return true;
      } catch (err) {
        store.addToast({ type: "error", message: humanizeError(err) });
        store.setPhase("idle");
        return false;
      }
    },
    [getProvider, wallet.publicKey, store, refreshBalances]
  );

  /** Place a bet on-chain */
  const placeBet = useCallback(
    async (
      solAmount: number,
      roundId: number,
      vrfCommitment: Uint8Array
    ): Promise<string | null> => {
      const provider = getProvider();
      if (!provider || !wallet.publicKey) return null;

      store.setPhase("tx_pending");
      store.setTxPending("Placing bet on Solana...");

      try {
        const program = getProgram(provider);
        const [casinoPDA] = getCasinoPDA();
        const [playerPDA] = getPlayerPDA(wallet.publicKey);
        const [betPDA] = getBetPDA(wallet.publicKey, BigInt(roundId));
        const lamports = solToLamports(solAmount);

        const sig = await program.methods
          .placeBet(
            new BN(lamports.toString()),
            new BN(roundId),
            Array.from(vrfCommitment)
          )
          .accounts({
            casinoState: casinoPDA,
            playerAccount: playerPDA,
            betAccount: betPDA,
            player: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        store.setCurrentBet(solAmount);
        await refreshBalances();
        return sig;
      } catch (err) {
        store.addToast({ type: "error", message: humanizeError(err) });
        store.setPhase("idle");
        return null;
      }
    },
    [getProvider, wallet.publicKey, store, refreshBalances]
  );

  /** Signal cashout on-chain at a given multiplier */
  const cashout = useCallback(
    async (roundId: number, cashoutX100: number): Promise<string | null> => {
      const provider = getProvider();
      if (!provider || !wallet.publicKey) return null;

      store.setTxPending("Cashing out...");

      try {
        const program = getProgram(provider);
        const [casinoPDA] = getCasinoPDA();
        const [betPDA] = getBetPDA(wallet.publicKey, BigInt(roundId));

        const sig = await program.methods
          .cashout(new BN(roundId), new BN(cashoutX100))
          .accounts({
            casinoState: casinoPDA,
            betAccount: betPDA,
            player: wallet.publicKey,
          })
          .rpc();

        return sig;
      } catch (err) {
        console.error("cashout tx failed:", err);
        return null;
      }
    },
    [getProvider, wallet.publicKey, store]
  );

  /**
   * Settle the round on-chain (normally done by casino server/crank).
   * In this demo the frontend settles since there's no backend.
   */
  const settleRound = useCallback(
    async (
      roundId: number,
      crashPointX100: number,
      vrfSeed: Uint8Array,
      playerPubkey: PublicKey
    ): Promise<boolean> => {
      const provider = getProvider();
      if (!provider || !wallet.publicKey) return false;

      try {
        const program = getProgram(provider);
        const [casinoPDA] = getCasinoPDA();
        const [escrowPDA] = getEscrowPDA(casinoPDA);
        const [playerPDA] = getPlayerPDA(playerPubkey);
        const [betPDA] = getBetPDA(playerPubkey, BigInt(roundId));

        await program.methods
          .settleRound(
            new BN(roundId),
            new BN(crashPointX100),
            Array.from(vrfSeed)
          )
          .accounts({
            casinoState: casinoPDA,
            playerAccount: playerPDA,
            betAccount: betPDA,
            escrow: escrowPDA,
            authority: wallet.publicKey,
          })
          .rpc();

        await refreshBalances();
        return true;
      } catch (err) {
        console.error("settleRound error:", err);
        return false;
      }
    },
    [getProvider, wallet.publicKey, refreshBalances]
  );

  /** Withdraw SOL from casino escrow back to wallet */
  const withdraw = useCallback(
    async (solAmount: number): Promise<boolean> => {
      const provider = getProvider();
      if (!provider || !wallet.publicKey) return false;

      store.setPhase("tx_pending");
      store.setTxPending("Withdrawing SOL to wallet...");

      try {
        const program = getProgram(provider);
        const [casinoPDA] = getCasinoPDA();
        const [escrowPDA] = getEscrowPDA(casinoPDA);
        const [playerPDA] = getPlayerPDA(wallet.publicKey);
        const lamports = solToLamports(solAmount);

        const sig = await program.methods
          .withdraw(new BN(lamports.toString()))
          .accounts({
            casinoState: casinoPDA,
            escrow: escrowPDA,
            playerAccount: playerPDA,
            player: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        store.addToast({
          type: "success",
          message: `Withdrew ${solAmount} SOL to wallet`,
          txSignature: sig,
        });
        await refreshBalances();
        store.setPhase("idle");
        return true;
      } catch (err) {
        store.addToast({ type: "error", message: humanizeError(err) });
        store.setPhase("idle");
        return false;
      }
    },
    [getProvider, wallet.publicKey, store, refreshBalances]
  );

  return {
    deposit,
    placeBet,
    cashout,
    settleRound,
    withdraw,
    refreshBalances,
  };
}
