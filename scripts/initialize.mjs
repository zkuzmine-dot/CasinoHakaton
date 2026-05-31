import { Connection, Keypair, PublicKey, clusterApiUrl, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load IDL
const IDL = JSON.parse(readFileSync(join(__dirname, "../app/app/lib/idl.json"), "utf8"));

const PROGRAM_ID = new PublicKey("HW6pFJx72iiRSSg2Pijtt2p9jQZRiHuvpXGkMrbvaqy9");

// Load wallet from Solana CLI keypair
const walletPath = process.env.USERPROFILE + "/.config/solana/id.json";
const secret = JSON.parse(readFileSync(walletPath, "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

console.log("Authority:", keypair.publicKey.toBase58());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

const program = new Program(IDL, PROGRAM_ID, provider);

// PDAs
const [casinoPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("casino")],
  PROGRAM_ID
);
const [escrowPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), casinoPDA.toBuffer()],
  PROGRAM_ID
);

console.log("Casino PDA:", casinoPDA.toBase58());
console.log("Escrow PDA:", escrowPDA.toBase58());

// Check if already initialized
try {
  const existing = await program.account.casinoState.fetch(casinoPDA);
  console.log("Casino already initialized!");
  console.log("House edge:", existing.houseEdgeBps, "bps");
  console.log("Authority:", existing.authority.toBase58());
  process.exit(0);
} catch {
  console.log("Initializing casino...");
}

const tx = await program.methods
  .initializeCasino(300) // 3% house edge
  .accounts({
    casinoState: casinoPDA,
    escrow: escrowPDA,
    authority: keypair.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Casino initialized!");
console.log("Tx signature:", tx);
console.log("View on explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
