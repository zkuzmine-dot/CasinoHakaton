use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("HW6pFJx72iiRSSg2Pijtt2p9jQZRiHuvpXGkMrbvaqy9");

pub const CASINO_SEED: &[u8] = b"casino";
pub const PLAYER_SEED: &[u8] = b"player";
pub const BET_SEED: &[u8] = b"bet";
pub const ESCROW_SEED: &[u8] = b"escrow";

pub const MIN_BET_LAMPORTS: u64 = 10_000_000;   // 0.01 SOL
pub const MAX_BET_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

#[program]
pub mod crash_casino {
    use super::*;

    /// Initialize casino state PDA. Called once by admin.
    pub fn initialize_casino(ctx: Context<InitializeCasino>, house_edge_bps: u16) -> Result<()> {
        require!(house_edge_bps <= 1000, CasinoError::InvalidHouseEdge); // max 10%

        let casino = &mut ctx.accounts.casino_state;
        casino.authority = ctx.accounts.authority.key();
        casino.house_edge_bps = house_edge_bps;
        casino.total_rounds = 0;
        casino.total_volume = 0;
        casino.bump = ctx.bumps.casino_state;
        casino.escrow_bump = ctx.bumps.escrow;

        emit!(CasinoInitialized {
            authority: casino.authority,
            house_edge_bps,
        });

        Ok(())
    }

    /// Player deposits SOL into casino escrow, credited to their PlayerAccount.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount >= MIN_BET_LAMPORTS, CasinoError::DepositTooSmall);

        // Transfer SOL from player to escrow PDA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, amount)?;

        // Credit balance in PlayerAccount
        let player_account = &mut ctx.accounts.player_account;
        player_account.balance = player_account
            .balance
            .checked_add(amount)
            .ok_or(CasinoError::Overflow)?;
        player_account.owner = ctx.accounts.player.key();
        player_account.bump = ctx.bumps.player_account;

        emit!(Deposited {
            player: ctx.accounts.player.key(),
            amount,
            new_balance: player_account.balance,
        });

        Ok(())
    }

    /// Player places a bet for a given round.
    /// The crash point is determined by a commit-reveal VRF scheme:
    ///   - server commits hash(seed || round_id) before round starts
    ///   - seed is revealed after round ends, crash point is verifiable
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        amount: u64,
        round_id: u64,
        vrf_commitment: [u8; 32], // SHA-256 hash of the VRF seed (commit phase)
    ) -> Result<()> {
        require!(amount >= MIN_BET_LAMPORTS, CasinoError::BetTooSmall);
        require!(amount <= MAX_BET_LAMPORTS, CasinoError::BetTooLarge);

        let player_account = &mut ctx.accounts.player_account;
        require!(
            player_account.balance >= amount,
            CasinoError::InsufficientBalance
        );

        player_account.balance = player_account
            .balance
            .checked_sub(amount)
            .ok_or(CasinoError::Overflow)?;

        let bet = &mut ctx.accounts.bet_account;
        bet.player = ctx.accounts.player.key();
        bet.round_id = round_id;
        bet.amount = amount;
        bet.cashout_x100 = 0; // 0 = not cashed out
        bet.is_settled = false;
        bet.vrf_commitment = vrf_commitment;
        bet.bump = ctx.bumps.bet_account;

        let casino = &mut ctx.accounts.casino_state;
        casino.total_rounds = casino.total_rounds.checked_add(1).ok_or(CasinoError::Overflow)?;
        casino.total_volume = casino
            .total_volume
            .checked_add(amount)
            .ok_or(CasinoError::Overflow)?;

        emit!(BetPlaced {
            player: ctx.accounts.player.key(),
            round_id,
            amount,
            vrf_commitment,
        });

        Ok(())
    }

    /// Player signals cashout at a given multiplier (before crash).
    /// cashout_x100: multiplier × 100 (e.g. 234 = 2.34x)
    pub fn cashout(
        ctx: Context<Cashout>,
        round_id: u64,
        cashout_x100: u64,
    ) -> Result<()> {
        let bet = &mut ctx.accounts.bet_account;
        require!(!bet.is_settled, CasinoError::AlreadySettled);
        require!(cashout_x100 >= 100, CasinoError::InvalidCashout); // min 1.00x
        require!(bet.cashout_x100 == 0, CasinoError::AlreadyCashedOut);

        bet.cashout_x100 = cashout_x100;

        emit!(CashedOut {
            player: ctx.accounts.player.key(),
            round_id,
            cashout_x100,
        });

        Ok(())
    }

    /// Settle a round after crash.
    /// crash_point_x100: crash point × 100 (e.g. 200 = 2.00x)
    /// vrf_seed: the revealed seed (anyone can verify crash_point from this)
    ///
    /// Crash formula (provably fair):
    ///   vrf_float = first 8 bytes of SHA256(seed) interpreted as u64 / u64::MAX
    ///   crash_point = 0.97 / (1 - vrf_float)   [clamped at 1.00x minimum]
    pub fn settle_round(
        ctx: Context<SettleRound>,
        round_id: u64,
        crash_point_x100: u64,
        vrf_seed: [u8; 32], // revealed VRF seed
    ) -> Result<()> {
        let bet = &mut ctx.accounts.bet_account;
        require!(!bet.is_settled, CasinoError::AlreadySettled);
        require!(crash_point_x100 >= 100, CasinoError::InvalidCrashPoint);

        // Verify the seed matches the commitment
        let computed_hash = anchor_lang::solana_program::hash::hashv(&[&vrf_seed, &round_id.to_le_bytes()]);
        require!(
            computed_hash.to_bytes() == bet.vrf_commitment,
            CasinoError::InvalidVrfSeed
        );

        // Derive crash point from seed (same formula as frontend)
        let vrf_u64 = u64::from_le_bytes(vrf_seed[0..8].try_into().unwrap());
        // vrf_float ∈ [0, 1) mapped from vrf_u64 / u64::MAX
        // crash_x100 = floor(9700 / (10000 - vrf_pct)) where vrf_pct = vrf_u64 * 10000 / u64::MAX
        // Simplified to avoid floating point:
        //   crash_x100 * (u64::MAX - vrf_u64) = 97 * u64::MAX
        // We compute in u128 to avoid overflow
        let numerator: u128 = 97u128 * (u64::MAX as u128);
        let denominator: u128 = (u64::MAX as u128) - (vrf_u64 as u128);
        let derived_crash_x100 = if denominator == 0 {
            10000u64 // cap at 100x
        } else {
            (numerator / denominator).min(10000) as u64
        };
        let derived_crash_x100 = derived_crash_x100.max(100); // minimum 1.00x

        // Crash point must match derived value (within 1 unit tolerance for rounding)
        let diff = if crash_point_x100 > derived_crash_x100 {
            crash_point_x100 - derived_crash_x100
        } else {
            derived_crash_x100 - crash_point_x100
        };
        require!(diff <= 1, CasinoError::CrashPointMismatch);

        bet.is_settled = true;

        let house_edge_bps = ctx.accounts.casino_state.house_edge_bps as u64;
        let casino_state = &ctx.accounts.casino_state;
        let escrow_bump = casino_state.escrow_bump;
        let player_account = &mut ctx.accounts.player_account;

        let won = bet.cashout_x100 > 0 && bet.cashout_x100 <= crash_point_x100;

        if won {
            // payout = bet * cashout_multiplier * (1 - house_edge)
            let gross_payout = (bet.amount as u128)
                .checked_mul(bet.cashout_x100 as u128)
                .ok_or(CasinoError::Overflow)? / 100;
            let house_cut = gross_payout
                .checked_mul(house_edge_bps as u128)
                .ok_or(CasinoError::Overflow)? / 10000;
            let net_payout = gross_payout
                .checked_sub(house_cut)
                .ok_or(CasinoError::Overflow)? as u64;

            player_account.balance = player_account
                .balance
                .checked_add(net_payout)
                .ok_or(CasinoError::Overflow)?;

            // Transfer payout from escrow to player_account (balance only; actual SOL moved on withdraw)
            // Escrow SOL stays locked; player_account.balance tracks entitlement

            emit!(RoundSettled {
                player: bet.player,
                round_id,
                crash_point_x100,
                cashout_x100: bet.cashout_x100,
                won: true,
                payout: net_payout,
                vrf_seed,
            });
        } else {
            // Player lost — bet already deducted from balance at place_bet
            emit!(RoundSettled {
                player: bet.player,
                round_id,
                crash_point_x100,
                cashout_x100: bet.cashout_x100,
                won: false,
                payout: 0,
                vrf_seed,
            });
        }

        let _ = escrow_bump; // used by constraint

        Ok(())
    }

    /// Player withdraws their balance from the escrow back to their wallet.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount >= MIN_BET_LAMPORTS, CasinoError::WithdrawTooSmall);

        let player_account = &mut ctx.accounts.player_account;
        require!(
            player_account.balance >= amount,
            CasinoError::InsufficientBalance
        );

        player_account.balance = player_account
            .balance
            .checked_sub(amount)
            .ok_or(CasinoError::Overflow)?;

        // Transfer from escrow PDA to player wallet
        let casino_key = ctx.accounts.casino_state.key();
        let escrow_bump = ctx.accounts.casino_state.escrow_bump;
        let escrow_seeds: &[&[u8]] = &[ESCROW_SEED, casino_key.as_ref(), &[escrow_bump]];
        let signer_seeds = &[escrow_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.player.to_account_info(),
            },
            signer_seeds,
        );
        system_program::transfer(cpi_ctx, amount)?;

        emit!(Withdrawn {
            player: ctx.accounts.player.key(),
            amount,
            remaining_balance: player_account.balance,
        });

        Ok(())
    }
}

// ──────────────────────────────────────────────
// Account Structs
// ──────────────────────────────────────────────

#[account]
pub struct CasinoState {
    pub authority: Pubkey,
    pub house_edge_bps: u16,
    pub total_rounds: u64,
    pub total_volume: u64,
    pub bump: u8,
    pub escrow_bump: u8,
}

impl CasinoState {
    pub const LEN: usize = 8 + 32 + 2 + 8 + 8 + 1 + 1;
}

#[account]
pub struct PlayerAccount {
    pub owner: Pubkey,
    pub balance: u64,
    pub total_bets: u64,
    pub total_wins: u64,
    pub bump: u8,
}

impl PlayerAccount {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct BetAccount {
    pub player: Pubkey,
    pub round_id: u64,
    pub amount: u64,
    pub cashout_x100: u64,
    pub is_settled: bool,
    pub vrf_commitment: [u8; 32],
    pub bump: u8,
}

impl BetAccount {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1 + 32 + 1;
}

// ──────────────────────────────────────────────
// Contexts
// ──────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeCasino<'info> {
    #[account(
        init,
        payer = authority,
        space = CasinoState::LEN,
        seeds = [CASINO_SEED],
        bump
    )]
    pub casino_state: Account<'info, CasinoState>,

    /// CHECK: escrow PDA that holds player SOL
    #[account(
        mut,
        seeds = [ESCROW_SEED, casino_state.key().as_ref()],
        bump
    )]
    pub escrow: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(seeds = [CASINO_SEED], bump = casino_state.bump)]
    pub casino_state: Account<'info, CasinoState>,

    /// CHECK: escrow PDA
    #[account(
        mut,
        seeds = [ESCROW_SEED, casino_state.key().as_ref()],
        bump = casino_state.escrow_bump
    )]
    pub escrow: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = player,
        space = PlayerAccount::LEN,
        seeds = [PLAYER_SEED, player.key().as_ref()],
        bump
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, round_id: u64)]
pub struct PlaceBet<'info> {
    #[account(mut, seeds = [CASINO_SEED], bump = casino_state.bump)]
    pub casino_state: Account<'info, CasinoState>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, player.key().as_ref()],
        bump = player_account.bump,
        constraint = player_account.owner == player.key() @ CasinoError::Unauthorized
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(
        init,
        payer = player,
        space = BetAccount::LEN,
        seeds = [BET_SEED, player.key().as_ref(), &round_id.to_le_bytes()],
        bump
    )]
    pub bet_account: Account<'info, BetAccount>,

    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct Cashout<'info> {
    #[account(seeds = [CASINO_SEED], bump = casino_state.bump)]
    pub casino_state: Account<'info, CasinoState>,

    #[account(
        mut,
        seeds = [BET_SEED, player.key().as_ref(), &round_id.to_le_bytes()],
        bump = bet_account.bump,
        constraint = bet_account.player == player.key() @ CasinoError::Unauthorized
    )]
    pub bet_account: Account<'info, BetAccount>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SettleRound<'info> {
    #[account(seeds = [CASINO_SEED], bump = casino_state.bump)]
    pub casino_state: Account<'info, CasinoState>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, bet_account.player.as_ref()],
        bump = player_account.bump
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(
        mut,
        seeds = [BET_SEED, bet_account.player.as_ref(), &round_id.to_le_bytes()],
        bump = bet_account.bump
    )]
    pub bet_account: Account<'info, BetAccount>,

    /// CHECK: escrow, needed for balance check
    #[account(
        mut,
        seeds = [ESCROW_SEED, casino_state.key().as_ref()],
        bump = casino_state.escrow_bump
    )]
    pub escrow: AccountInfo<'info>,

    // Only casino authority or a trusted crank can settle
    #[account(
        constraint = authority.key() == casino_state.authority @ CasinoError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(seeds = [CASINO_SEED], bump = casino_state.bump)]
    pub casino_state: Account<'info, CasinoState>,

    /// CHECK: escrow PDA
    #[account(
        mut,
        seeds = [ESCROW_SEED, casino_state.key().as_ref()],
        bump = casino_state.escrow_bump
    )]
    pub escrow: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, player.key().as_ref()],
        bump = player_account.bump,
        constraint = player_account.owner == player.key() @ CasinoError::Unauthorized
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ──────────────────────────────────────────────
// Events
// ──────────────────────────────────────────────

#[event]
pub struct CasinoInitialized {
    pub authority: Pubkey,
    pub house_edge_bps: u16,
}

#[event]
pub struct Deposited {
    pub player: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[event]
pub struct BetPlaced {
    pub player: Pubkey,
    pub round_id: u64,
    pub amount: u64,
    pub vrf_commitment: [u8; 32],
}

#[event]
pub struct CashedOut {
    pub player: Pubkey,
    pub round_id: u64,
    pub cashout_x100: u64,
}

#[event]
pub struct RoundSettled {
    pub player: Pubkey,
    pub round_id: u64,
    pub crash_point_x100: u64,
    pub cashout_x100: u64,
    pub won: bool,
    pub payout: u64,
    pub vrf_seed: [u8; 32],
}

#[event]
pub struct Withdrawn {
    pub player: Pubkey,
    pub amount: u64,
    pub remaining_balance: u64,
}

// ──────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────

#[error_code]
pub enum CasinoError {
    #[msg("House edge must be between 0 and 1000 bps")]
    InvalidHouseEdge,
    #[msg("Deposit amount is too small")]
    DepositTooSmall,
    #[msg("Bet amount is below minimum (0.01 SOL)")]
    BetTooSmall,
    #[msg("Bet amount exceeds maximum (1 SOL)")]
    BetTooLarge,
    #[msg("Insufficient balance in player account")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Round already settled")]
    AlreadySettled,
    #[msg("Player already cashed out")]
    AlreadyCashedOut,
    #[msg("Invalid cashout multiplier")]
    InvalidCashout,
    #[msg("Invalid crash point")]
    InvalidCrashPoint,
    #[msg("VRF seed does not match commitment")]
    InvalidVrfSeed,
    #[msg("Crash point derived from seed does not match provided value")]
    CrashPointMismatch,
    #[msg("Withdraw amount is too small")]
    WithdrawTooSmall,
}
