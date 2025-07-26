use anchor_lang::prelude::*;
use std::mem::size_of;

// The unique on-chain address of your program.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// The main container for your program's instructions.
#[program]
pub mod contribution_log {
    use super::*;

    /// Instruction to initialize the central logging state account.
    /// The user who calls this becomes the permanent 'authority' for the log.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let log_state = &mut ctx.accounts.log_state;
        log_state.authority = *ctx.accounts.user.key;
        log_state.contributions = Vec::new();
        msg!(
            "Contribution log initialized. Authority: {}",
            log_state.authority
        );
        Ok(())
    }

    /// Instruction to log a new code contribution.
    /// Only the designated 'authority' can call this instruction.
    pub fn log_contribution(ctx: Context<LogContribution>, code_hash: String) -> Result<()> {
        // Validate the input code hash.
        require!(!code_hash.is_empty(), ContributionError::EmptyCodeHash);
        require!(
            code_hash.len() <= Contribution::MAX_HASH_LEN,
            ContributionError::CodeHashTooLong
        );

        let log_state = &mut ctx.accounts.log_state;
        let authority = &ctx.accounts.authority;
        let clock = Clock::get()?;

        // Create the new contribution entry.
        let new_contribution = Contribution {
            contributor: *authority.key,
            timestamp: clock.unix_timestamp,
            code_hash,
        };

        // Append the new entry to the vector.
        log_state.contributions.push(new_contribution);

        msg!("Contribution logged by authority: {}", authority.key());
        Ok(())
    }
}

/// Context for the `initialize` instruction.
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The central state account being created (PDA).
    /// `space`: We allocate an initial 256 bytes to account for the authority key.
    #[account(
        init,
        payer = user,
        space = 256,
        seeds = [b"log_state"],
        bump
    )]
    pub log_state: Account<'info, LogState>,

    /// The user who is initializing the log. They will become the authority.
    #[account(mut)]
    pub user: Signer<'info>,

    /// The official Solana System Program.
    pub system_program: Program<'info, System>,
}

/// Context for the `log_contribution` instruction.
#[derive(Accounts)]
pub struct LogContribution<'info> {
    /// The central state account.
    /// `has_one = authority`: This is the core security check. It ensures the `authority`
    /// account passed into the context is the same one stored in `log_state.authority`.
    #[account(
        mut,
        has_one = authority,
        realloc = log_state.new_space(),
        realloc::payer = authority,
        realloc::zero = false,
        seeds = [b"log_state"],
        bump
    )]
    pub log_state: Account<'info, LogState>,

    /// The authority signer. Must be the account that was set during initialization.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The official Solana System Program.
    pub system_program: Program<'info, System>,
}

/// The central state account that stores the authority and a vector of all contributions.
#[account]
pub struct LogState {
    pub authority: Pubkey,
    pub contributions: Vec<Contribution>,
}

impl LogState {
    /// Calculates the required space for the account when adding a new contribution.
    fn new_space(&self) -> usize {
        // 8 bytes discriminator + 32 bytes authority Pubkey + 4 bytes Vec length
        let base_size = 8 + 32 + 4;
        // Size of all existing items + one new item
        let vec_content_size = (self.contributions.len() + 1) * size_of::<Contribution>();
        base_size + vec_content_size
    }
}

/// Defines the data structure for a single contribution log.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Contribution {
    pub contributor: Pubkey,
    pub timestamp: i64,
    pub code_hash: String,
}

impl Contribution {
    // Define a constant for max hash length for consistency.
    const MAX_HASH_LEN: usize = 64;
}

/// Defines custom, specific errors for the program.
#[error_code]
pub enum ContributionError {
    #[msg("The provided code hash cannot be empty.")]
    EmptyCodeHash,
    #[msg("The provided code hash is too long. Max 64 characters.")]
    CodeHashTooLong,
}
