const { Connection, Keypair, PublicKey, clusterApiUrl, SystemProgram } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");
const os = require("os");

const IDL = JSON.parse(fs.readFileSync("./app/lib/idl.json", "utf8"));
const PROGRAM_ID = new PublicKey("HW6pFJx72iiRSSg2Pijtt2p9jQZRiHuvpXGkMrbvaqy9");

const secret = JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/id.json", "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
console.log("Authority:", keypair.publicKey.toBase58());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: (tx) => { tx.partialSign(keypair); return Promise.resolve(tx); },
  signAllTransactions: (txs) => { txs.forEach(t => t.partialSign(keypair)); return Promise.resolve(txs); },
};

const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
const program = new anchor.Program(IDL, PROGRAM_ID, provider);

const [casinoPDA] = PublicKey.findProgramAddressSync([Buffer.from("casino")], PROGRAM_ID);
const [escrowPDA] = PublicKey.findProgramAddressSync([Buffer.from("escrow"), casinoPDA.toBuffer()], PROGRAM_ID);

console.log("Casino PDA:", casinoPDA.toBase58());

async function main() {
  try {
    const existing = await program.account.casinoState.fetch(casinoPDA);
    console.log("\nAlready initialized! House edge:", existing.houseEdgeBps, "bps");
    return;
  } catch { }

  console.log("Sending initialize_casino transaction...");
  const tx = await program.methods
    .initializeCasino(300)
    .accounts({
      casinoState: casinoPDA,
      escrow: escrowPDA,
      authority: keypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("\nDone! Casino live on devnet.");
  console.log("Tx:", tx);
  console.log("https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
}

main().catch(e => { console.error(e.message); process.exit(1); });
