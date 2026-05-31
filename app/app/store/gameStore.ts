import { create } from "zustand";

export type GamePhase =
  | "idle"
  | "waiting"
  | "flying"
  | "crashed"
  | "cashed_out"
  | "tx_pending";

export interface RoundResult {
  roundId: number;
  crashPoint: number;
  cashedOutAt?: number;
  won: boolean;
  payout?: number;
  vrfSeedHex?: string;
  betTxSig?: string; // placeBet tx — proves commitment was recorded before the round
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  txSignature?: string;
}

interface GameState {
  // Game phase
  phase: GamePhase;
  multiplier: number;
  crashPoint: number | null;
  roundId: number;
  roundSeed: Uint8Array | null;

  // Player bet state
  currentBet: number | null;
  autoCashoutAt: number | null;
  cashedOutAt: number | null;

  // Balances
  walletBalance: number;
  casinoBalance: number;

  // History
  history: RoundResult[];
  betTxSig: string | null;

  // UI state
  toasts: ToastMessage[];
  txPendingMessage: string;
  betAmount: number;

  // Actions
  setPhase: (phase: GamePhase) => void;
  setMultiplier: (m: number) => void;
  setCrashPoint: (cp: number) => void;
  setRoundId: (id: number) => void;
  setRoundSeed: (seed: Uint8Array) => void;
  setCurrentBet: (amount: number | null) => void;
  setAutoCashout: (target: number | null) => void;
  setCashedOut: (at: number) => void;
  setWalletBalance: (bal: number) => void;
  setCasinoBalance: (bal: number) => void;
  addToHistory: (result: RoundResult) => void;
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
  setTxPending: (message: string) => void;
  setBetAmount: (amount: number) => void;
  setBetTxSig: (sig: string | null) => void;
  resetRound: () => void;
}

export const useGameStore = create<GameState>((set, _get) => ({
  phase: "idle",
  multiplier: 1.0,
  crashPoint: null,
  roundId: 0,
  roundSeed: null,

  currentBet: null,
  autoCashoutAt: null,
  cashedOutAt: null,

  walletBalance: 0,
  casinoBalance: 0,

  history: [],
  betTxSig: null,
  toasts: [],
  txPendingMessage: "",
  betAmount: 0.1,

  setPhase: (phase) => set({ phase }),
  setMultiplier: (multiplier) => set({ multiplier }),
  setCrashPoint: (crashPoint) => set({ crashPoint }),
  setRoundId: (roundId) => set({ roundId }),
  setRoundSeed: (roundSeed) => set({ roundSeed }),
  setCurrentBet: (currentBet) => set({ currentBet }),
  setAutoCashout: (autoCashoutAt) => set({ autoCashoutAt }),
  setCashedOut: (cashedOutAt) => set({ cashedOutAt, phase: "cashed_out" }),
  setWalletBalance: (walletBalance) => set({ walletBalance }),
  setCasinoBalance: (casinoBalance) => set({ casinoBalance }),

  addToHistory: (result) =>
    set((state) => ({
      history: [result, ...state.history].slice(0, 20),
    })),

  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: `${Date.now()}-${Math.random()}` },
      ].slice(-5),
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setTxPending: (txPendingMessage) => set({ txPendingMessage }),

  setBetAmount: (betAmount) => set({ betAmount }),
  setBetTxSig: (betTxSig) => set({ betTxSig }),

  resetRound: () =>
    set({
      multiplier: 1.0,
      crashPoint: null,
      currentBet: null,
      cashedOutAt: null,
      phase: "idle",
    }),
}));
