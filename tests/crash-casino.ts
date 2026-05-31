import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { CrashCasino } from "../target/types/crash_casino";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createHash } from "crypto";
import assert from "assert";

function makeVrfCommitment(seed: Buffer, roundId: bigint): Buffer {
  const roundIdBuf = Buffer.alloc(8);
  roundIdBuf.writeBigUInt64LE(roundId);
  return Buffer.from(createHash("sha256").update(Buffer.concat([seed, roundIdBuf])).digest());
}

function deriveCrashPoint(seed: Buffer, roundId: bigint): number {
  const roundIdBuf = Buffer.alloc(8);
  roundIdBuf.writeBigUInt64LE(roundId);
  const hash = createHash("sha256").update(Buffer.concat([seed, roundIdBuf])).digest();
  const vrfU64 = hash.readBigUInt64LE(0);
  const MAX_U64 = BigInt("18446744073709551615");
  const numerator = BigInt(97) * MAX_U64;
  const denominator = MAX_U64 - vrfU64;
  if (denominator === 0n) return 100.0;
  const crashX100 = numerator / denominator;
  const clamped = crashX100 > BigInt(10000) ? BigInt(10000) : crashX100;
  return Number(clamped < BigInt(100) ? BigInt(100) : clamped) / 100;
}

describe("crash-casino", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CrashCasino as Program<CrashCasino>;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const player = Keypair.generate();

  const [casinoPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("casino")],
    program.programId
  );
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), casinoPDA.toBuffer()],
    program.programId
  );
  const [playerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), player.publicKey.toBuffer()],
    program.programId
  );

  before(async () => {
    // Airdrop to player and authority
    const sig1 = await provider.connection.requestAirdrop(player.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig1);
    const sig2 = await provider.connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig2);
  });

  it("Initialize casino", async () => {
    await program.methods
      .initializeCasino(300) // 3% house edge
      .accounts({
        casinoState: casinoPDA,
        escrow: escrowPDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const casino = await program.account.casinoState.fetch(casinoPDA);
    assert.equal(casino.houseEdgeBps, 300);
    assert.equal(casino.authority.toBase58(), authority.publicKey.toBase58());
    console.log("Casino initialized. House edge: 3%");
  });

  it("Deposit SOL", async () => {
    const depositAmount = new BN(0.5 * LAMPORTS_PER_SOL);

    await program.methods
      .deposit(depositAmount)
      .accounts({
        casinoState: casinoPDA,
        escrow: escrowPDA,
        playerAccount: playerPDA,
        player: player.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const playerAccount = await program.account.playerAccount.fetch(playerPDA);
    assert.ok(playerAccount.balance.eq(depositAmount));
    console.log(`Player deposited 0.5 SOL. Balance: ${playerAccount.balance.toNumber() / LAMPORTS_PER_SOL} SOL`);
  });

  it("Place bet and settle (loss scenario)", async () => {
    const roundId = BigInt(1);
    const betAmount = new BN(0.1 * LAMPORTS_PER_SOL);

    // Generate seed that produces a very low crash point (near 1.00x)
    // We'll simulate: player doesn't cash out → loses
    const seed = Buffer.alloc(32, 0xff); // deterministic seed for tests
    const commitment = makeVrfCommitment(seed, roundId);
    const crashPoint = deriveCrashPoint(seed, roundId);
    const crashPointX100 = Math.floor(crashPoint * 100);

    console.log(`Test crash point: ${crashPoint.toFixed(2)}x (x100: ${crashPointX100})`);

    const [betPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), player.publicKey.toBuffer(), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(roundId); return b; })()],
      program.programId
    );

    // Place bet (no cashout intention)
    await program.methods
      .placeBet(betAmount, new BN(roundId.toString()), Array.from(commitment))
      .accounts({
        casinoState: casinoPDA,
        playerAccount: playerPDA,
        betAccount: betPDA,
        player: player.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const balanceAfterBet = (await program.account.playerAccount.fetch(playerPDA)).balance;
    console.log(`Balance after bet: ${balanceAfterBet.toNumber() / LAMPORTS_PER_SOL} SOL`);

    // Settle (cashout_x100 = 0, meaning player didn't cash out)
    await program.methods
      .settleRound(new BN(roundId.toString()), new BN(crashPointX100), Array.from(seed))
      .accounts({
        casinoState: casinoPDA,
        playerAccount: playerPDA,
        betAccount: betPDA,
        escrow: escrowPDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    const balanceAfterSettle = (await program.account.playerAccount.fetch(playerPDA)).balance;
    console.log(`Balance after settle (loss): ${balanceAfterSettle.toNumber() / LAMPORTS_PER_SOL} SOL`);
    assert.ok(balanceAfterSettle.eq(balanceAfterBet)); // should be unchanged (bet already deducted)
  });

  it("Withdraw remaining balance", async () => {
    const playerAccount = await program.account.playerAccount.fetch(playerPDA);
    const withdrawAmount = playerAccount.balance;

    if (withdrawAmount.toNumber() < 0.01 * LAMPORTS_PER_SOL) {
      console.log("Balance too low to withdraw, skipping");
      return;
    }

    await program.methods
      .withdraw(withdrawAmount)
      .accounts({
        casinoState: casinoPDA,
        escrow: escrowPDA,
        playerAccount: playerPDA,
        player: player.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const balanceAfter = (await program.account.playerAccount.fetch(playerPDA)).balance;
    assert.ok(balanceAfter.eq(new BN(0)));
    console.log("Withdraw successful. Casino balance: 0");
  });
});
