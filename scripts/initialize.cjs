const { Connection, Keypair, PublicKey, clusterApiUrl, SystemProgram } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const { AnchorProvider, Program, BN } = anchor;
const fs = require("fs");
const path = require("path");
const os = require("os");

const IDL = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/app/lib/idl.json"), "utf8"));
const PROGRAM_ID = new PublicKey("HW6pFJx72iiRSSg2Pijtt2p9jQZRiHuvpXGkMrbvaqy9");

const walletPath = path.join(os.homedir(), ".config/solana/id.json");
const secret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

console.log("Authority:", keypair.publicKey.toBase58());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Minimal wallet adapter for Node.js
const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: (tx) => { tx.partialSign(keypair); return Promise.resolve(tx); },
  signAllTransactions: (txs) => { txs.forEach(tx => tx.partialSign(keypair)); return Promise.resolve(txs); },
};

const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const program = new Program(IDL, PROGRAM_ID, provider);

const [casinoPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("casino")], PROGRAM_ID
);
const [escrowPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), casinoPDA.toBuffer()], PROGRAM_ID
);

console.log("Casino PDA:", casinoPDA.toBase58());
console.log("Escrow PDA:", escrowPDA.toBase58());

async function main() {
  // Check if already initialized
  try {
    const existing = await program.account.casinoState.fetch(casinoPDA);
    console.log("\nCasino already initialized!");
    console.log("House edge:", existing.houseEdgeBps, "bps (", existing.houseEdgeBps / 100, "%)");
    return;
  } catch {
    console.log("Not yet initialized. Creating casino...");
  }

  const tx = await program.methods
    .initializeCasino(300)
    .accounts({
      casinoState: casinoPDA,
      escrow: escrowPDA,
      authority: keypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("\nCasino initialized successfully!");
  console.log("Tx:", tx);
  console.log("Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
}

main().catch(console.error);
