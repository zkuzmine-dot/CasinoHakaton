import { AnchorProvider, Program, BN, web3 } from "@coral-xyz/anchor";
import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { IDL, CrashCasino } from "./idl";

// Placeholder ID — replace with real program ID after `anchor deploy`
export const PROGRAM_ID = new PublicKey("HW6pFJx72iiRSSg2Pijtt2p9jQZRiHuvpXGkMrbvaqy9");

// Use TextEncoder to avoid Buffer dependency at module load time (SSR-safe)
const enc = new TextEncoder();
export const CASINO_SEED = enc.encode("casino");
export const PLAYER_SEED = enc.encode("player");
export const BET_SEED    = enc.encode("bet");
export const ESCROW_SEED = enc.encode("escrow");

export const LAMPORTS_PER_SOL = 1_000_000_000;

export function getConnection(): Connection {
  return new Connection(clusterApiUrl("devnet"), "confirmed");
}

export function getProgram(provider: AnchorProvider): Program<CrashCasino> {
  return new Program(IDL, PROGRAM_ID, provider);
}

export function getCasinoPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CASINO_SEED], PROGRAM_ID);
}

export function getEscrowPDA(casinoPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ESCROW_SEED, casinoPDA.toBytes()],
    PROGRAM_ID
  );
}

export function getPlayerPDA(playerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PLAYER_SEED, playerPubkey.toBytes()],
    PROGRAM_ID
  );
}

export function getBetPDA(playerPubkey: PublicKey, roundId: bigint): [PublicKey, number] {
  const roundIdBuf = new Uint8Array(8);
  new DataView(roundIdBuf.buffer).setBigUint64(0, roundId, true);
  return PublicKey.findProgramAddressSync(
    [BET_SEED, playerPubkey.toBytes(), roundIdBuf],
    PROGRAM_ID
  );
}

/**
 * Provably fair crash point derivation.
 * Same formula as the Rust smart contract — anyone can verify.
 *
 * seed: 32-byte Uint8Array (revealed after round ends)
 * roundId: u64 as bigint
 *
 * Returns crash point as a number (e.g. 2.34 means 2.34x)
 */
export function deriveCrashPoint(seed: Uint8Array, _roundId: bigint): number {
  // Contract uses raw seed[0..8] as little-endian u64 — NOT hash(seed+roundId)
  const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
  const vrfU64 = view.getBigUint64(0, true);

  const MAX_U64 = BigInt("18446744073709551615");

  const numerator = BigInt(97) * MAX_U64;
  const denominator = MAX_U64 - vrfU64;

  if (denominator === 0n) return 100.0;

  const crashX100 = numerator / denominator;
  const clamped = crashX100 > BigInt(10000) ? BigInt(10000) : crashX100;
  const final_ = clamped < BigInt(100) ? BigInt(100) : clamped;

  return Number(final_) / 100;
}

/**
 * Generates a VRF commitment for commit-reveal scheme.
 * seed: random 32-byte secret (kept server-side until round ends)
 * roundId: current round ID
 * Returns: commitment hash to store on-chain
 */
export function makeVrfCommitment(seed: Uint8Array, roundId: bigint): Uint8Array {
  const roundIdBytes = new Uint8Array(8);
  const view = new DataView(roundIdBytes.buffer);
  view.setBigUint64(0, roundId, true);
  return sha256(new Uint8Array([...seed, ...roundIdBytes]));
}

/**
 * Generate a cryptographically random seed for a round.
 */
export function generateRoundSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}
