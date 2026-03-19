use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::VAULT_SEED;
use crate::errors::PayFlowError;
use crate::state::PayrollVault;

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, PayFlowError::InvalidDisbursementAmount);

    // Transfer USDC from employer's token account → vault token account
    let cpi_accounts = Transfer {
        from: ctx.accounts.employer_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.employer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update vault totals
    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = vault.total_deposited.saturating_add(amount);

    msg!(
        "Deposited {} USDC (raw) into vault '{}'. Lifetime deposits: {}",
        amount,
        vault.vault_name,
        vault.total_deposited
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, employer.key().as_ref()],
        bump = vault.bump,
        has_one = employer @ PayFlowError::UnauthorizedEmployer,
        has_one = vault_token_account,
    )]
    pub vault: Account<'info, PayrollVault>,

    /// Employer's USDC token account (source of funds).
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = employer,
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    /// The vault's USDC token account (destination).
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}