"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { deriveCrashPoint, generateRoundSeed, makeVrfCommitment } from "../lib/program";

const ROUND_COUNTDOWN_MS = 5000;

/**
 * Game state machine for the Crash game.
 *
 * Round lifecycle:
 *   idle → waiting (5s countdown) → flying (multiplier grows) → crashed
 *   During flying: player can cash out → cashed_out
 */
export function useGame() {
  const store = useGameStore();
  const rafRef = useRef<number>(0);
  const roundStartTimeRef = useRef<number>(0);
  const crashPointRef = useRef<number>(1);
  const autoCashoutRef = useRef<number | null>(null);
  const currentBetRef = useRef<number | null>(null);
  const phaseRef = useRef(store.phase);
  // Guard: auto-cashout fires only once per round
  const cashoutFiredRef = useRef(false);

  // Keep refs in sync with store so animation loop doesn't stale-close
  useEffect(() => {
    phaseRef.current = store.phase;
  }, [store.phase]);

  useEffect(() => {
    autoCashoutRef.current = store.autoCashoutAt;
  }, [store.autoCashoutAt]);

  useEffect(() => {
    currentBetRef.current = store.currentBet;
  }, [store.currentBet]);

  /**
   * Multiplier growth formula: m(t) = e^(k*t)
   * Chosen so it feels natural and creates tension.
   * k ≈ 0.00006 gives ~6x after ~30 seconds
   */
  const calcMultiplier = (elapsedMs: number): number => {
    const k = 0.00006;
    return Math.max(1.0, Math.exp(k * elapsedMs));
  };

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const triggerCrash = useCallback((finalMultiplier: number) => {
    stopAnimation();
    store.setMultiplier(finalMultiplier);
    store.setPhase("crashed");

    const roundId = useGameStore.getState().roundId;
    const currentBet = currentBetRef.current;
    const cashedOutAt = useGameStore.getState().cashedOutAt;

    const roundSeed = useGameStore.getState().roundSeed;
    const vrfSeedHex = roundSeed
      ? Buffer.from(roundSeed).toString("hex")
      : undefined;

    store.addToHistory({
      roundId,
      crashPoint: finalMultiplier,
      cashedOutAt: cashedOutAt ?? undefined,
      won: cashedOutAt != null && cashedOutAt < finalMultiplier,
      payout: cashedOutAt != null && cashedOutAt < finalMultiplier && currentBet != null
        ? currentBet * cashedOutAt * 0.97
        : undefined,
      vrfSeedHex,
    });
  }, [stopAnimation, store]);

  const performAutoCashout = useCallback(
    (multiplier: number, onCashout: (m: number) => void) => {
      const target = autoCashoutRef.current;
      if (target && multiplier >= target && currentBetRef.current && !cashoutFiredRef.current) {
        cashoutFiredRef.current = true;
        onCashout(target);
      }
    },
    []
  );

  const startFlyingAnimation = useCallback(
    (crashPoint: number, onCashout: (m: number) => void) => {
      crashPointRef.current = crashPoint;
      roundStartTimeRef.current = performance.now();

      const tick = () => {
        if (phaseRef.current !== "flying") return;

        const elapsed = performance.now() - roundStartTimeRef.current;
        const multiplier = calcMultiplier(elapsed);

        if (multiplier >= crashPoint) {
          triggerCrash(crashPoint);
          return;
        }

        useGameStore.getState().setMultiplier(multiplier);
        performAutoCashout(multiplier, onCashout);

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [triggerCrash, performAutoCashout]
  );

  /**
   * Start a new round. Called after bet is placed on-chain.
   * seed: the VRF seed committed to the contract
   * roundId: the round ID
   */
  const startRound = useCallback(
    (seed: Uint8Array, roundId: number, onCashout: (multiplier: number) => void) => {
      cashoutFiredRef.current = false; // reset per-round guard
      store.setRoundId(roundId);
      store.setRoundSeed(seed);
      store.setPhase("waiting");
      store.setMultiplier(1.0);

      const crashPoint = deriveCrashPoint(seed, BigInt(roundId));
      store.setCrashPoint(crashPoint);

      // Countdown, then fly
      const countdownTimer = setTimeout(() => {
        if (phaseRef.current !== "waiting") return;
        store.setPhase("flying");
        startFlyingAnimation(crashPoint, onCashout);
      }, ROUND_COUNTDOWN_MS);

      return () => clearTimeout(countdownTimer);
    },
    [store, startFlyingAnimation]
  );

  /**
   * Player cashes out at the current multiplier.
   * Returns the cashout multiplier if successful.
   */
  const cashOut = useCallback((): number | null => {
    if (phaseRef.current !== "flying") return null;
    if (!currentBetRef.current) return null;

    const multiplier = useGameStore.getState().multiplier;
    const crashPoint = crashPointRef.current;

    if (multiplier >= crashPoint) return null; // already crashed

    cashoutFiredRef.current = true; // prevent auto-cashout from also firing
    stopAnimation();
    store.setCashedOut(multiplier);

    return multiplier;
  }, [stopAnimation, store]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAnimation();
  }, [stopAnimation]);

  return {
    startRound,
    cashOut,
    stopAnimation,
    calcMultiplier,
  };
}

/**
 * Pure utility: generate a new round seed and its on-chain commitment.
 * Used by the frontend "house" logic (in production, this would be server-side).
 */
export function prepareRound(roundId: number): {
  seed: Uint8Array;
  commitment: Uint8Array;
  crashPoint: number;
} {
  const seed = generateRoundSeed();
  const commitment = makeVrfCommitment(seed, BigInt(roundId));
  const crashPoint = deriveCrashPoint(seed, BigInt(roundId));
  return { seed, commitment, crashPoint };
}
