# CRASH.SOL — Provably Fair Crash Casino on Solana

A fully on-chain Crash casino game built for Solana Devnet. Every round is provably fair via a commit-reveal VRF scheme. No backend servers hold funds — all SOL is locked in on-chain escrow PDAs.

---

## Why Solana?

| Requirement | Solana's answer |
|---|---|
| Fast game loop (cashout before crash) | ~400ms finality, sub-second confirmations |
| Cheap micro-transactions (0.01 SOL bets) | ~0.000005 SOL per tx (~$0.001) |
| Transparent on-chain randomness | Program events + commit-reveal verifiable by anyone |
| No server custody | PDAs hold SOL, not admin wallets |

Ethereum's 12-second block time would make cashouts feel broken. Solana's speed is essential to the game feel.

---

## Provably Fair RNG — How It Works

We use a **commit-reveal scheme** (Chainlink VRF pattern adapted for Solana):

### Before the round
1. A random 32-byte `seed` is generated
2. `commitment = SHA-256(seed || round_id_LE)` is stored on-chain in the `BetAccount`
3. The seed is kept secret until the round ends

### During the round
- The multiplier grows exponentially: `m(t) = e^(0.00006 * t_ms)`
- Players can cash out at any moment

### After the round
1. The `seed` is revealed (submitted to the `settle_round` instruction)
2. The program verifies: `SHA-256(seed || round_id) == stored_commitment`
3. The crash point is derived deterministically:

```
vrf_u64 = first_8_bytes_of_seed_as_u64_LE
crash_x100 = floor(97 * U64_MAX / (U64_MAX - vrf_u64))
crash_point = max(crash_x100, 100) / 100     # minimum 1.00x
```

This formula produces a **3% house edge** mathematically: the expected value of any bet is 0.97 (3% less than the bet). Anyone can verify any round's crash point from its seed.

### Verification example
```typescript
import { sha256 } from "@noble/hashes/sha256";

function verifyCrashPoint(seedHex: string, roundId: number): number {
  const seed = Buffer.from(seedHex, "hex");
  const roundIdBuf = Buffer.alloc(8);
  roundIdBuf.writeBigUInt64LE(BigInt(roundId));
  const hash = sha256(Buffer.concat([seed, roundIdBuf]));
  const vrfU64 = Buffer.from(hash).readBigUInt64LE(0);
  const MAX = BigInt("18446744073709551615");
  const x100 = (BigInt(97) * MAX) / (MAX - vrfU64);
  return Math.max(Number(x100), 100) / 100;
}
```

---

## Architecture

```
crash-casino/
├── programs/crash-casino/src/lib.rs   Anchor smart contract
│   ├── initialize_casino              One-time setup, sets house edge
│   ├── deposit                        Player → Escrow PDA
│   ├── place_bet                      Deduct balance, store VRF commitment
│   ├── cashout                        Record player cashout multiplier
│   ├── settle_round                   Verify seed, pay winners
│   └── withdraw                       Escrow PDA → Player wallet
│
├── app/                               Next.js 14 App Router
│   ├── app/providers.tsx              Phantom wallet adapter context
│   ├── app/store/gameStore.ts         Zustand global state
│   ├── app/hooks/
│   │   ├── useGame.ts                 Game state machine (RAF animation)
│   │   └── useCasino.ts               Anchor program client calls
│   └── app/components/
│       ├── CrashChart.tsx             Canvas multiplier curve (RAF)
│       ├── BetPanel.tsx               Bet input + cashout button
│       ├── MultiplierDisplay.tsx      Centered multiplier overlay
│       ├── WalletButton.tsx           Phantom connect/disconnect
│       ├── RoundHistory.tsx           Recent crash points ticker
│       └── TransactionToast.tsx       Tx confirmation toasts
│
└── tests/crash-casino.ts             Anchor integration tests
```

### PDAs
| PDA | Seeds | Holds |
|---|---|---|
| `CasinoState` | `["casino"]` | Config, house edge, stats |
| `Escrow` | `["escrow", casino_key]` | All player SOL |
| `PlayerAccount` | `["player", player_key]` | Per-player balance |
| `BetAccount` | `["bet", player_key, round_id]` | Per-bet state + VRF commitment |

---

## Smart Contract Safety

- **House edge is enforced on-chain**: `settle_round` applies the 300 bps deduction to every winning payout
- **Crash point verified on-chain**: the program re-derives the crash point from the revealed seed and rejects any mismatch
- **No admin withdrawal**: authority can only `settle_round`; it cannot drain the escrow
- **Min/max bet enforced**: 0.01 SOL min, 1 SOL max, checked in `place_bet`
- **Double-settlement prevented**: `BetAccount.is_settled` flag checked before any payout

---

## Setup & Deploy

### Prerequisites
- Rust + Cargo
- Solana CLI (`>=1.18`) configured for devnet
- Anchor CLI (`>=0.29`)
- Node.js 18+
- Phantom wallet with devnet SOL (get from [faucet.solana.com](https://faucet.solana.com))

### Build & Deploy Contract
```bash
# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Build
anchor build

# Get program ID
solana-keygen pubkey target/deploy/crash_casino-keypair.json

# Update declare_id! in lib.rs and programs in Anchor.toml, then rebuild

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Initialize casino (run once)
anchor run initialize
```

### Run Frontend
```bash
cd app
npm install
npm run dev
# Open http://localhost:3000
```

### Run Tests
```bash
anchor test
```

### Deploy to Vercel
```bash
cd app
npx vercel --prod
```

---

## What's Next (Post-Hackathon)

1. **Switchboard VRF integration**: replace commit-reveal with on-chain VRF for trustless randomness (no seed custody even by frontend)
2. **Multiplayer**: WebSocket room for shared game rounds, live player count
3. **Leaderboard**: on-chain PDA tracking all-time wins
4. **Token support**: SPL token betting (USDC) via Token Program
5. **Auto-play**: configurable session with stop-loss / take-profit
6. **Sound**: procedural audio via Web Audio API (rocket launch → crash)
7. **Mobile wallet**: WalletConnect for non-Phantom mobile wallets

---

## House Edge Math

The crash formula `crash_x100 = floor(97 * MAX / (MAX - vrf_u64))` produces:

- P(crash ≥ k) = 0.97 / k  for k ≥ 1
- E[payout at k | survive to k] = k
- E[net] = Σ P(survive to k) × k × (1 - 0.03) - 1 = **-3%** house edge

This is identical to the math used by Bustabit (the original Crash game). The formula is well-audited and the edge is provably baked in.

---

*Built for Solana Hackathon 2024. Devnet only — no real money.*
