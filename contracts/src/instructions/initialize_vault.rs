use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

use crate::constants::*;
use crate::errors::PayFlowError;
use crate::state::PayrollVault;

pub fn handler(ctx: Context<InitializeVault>, vault_name: String) -> Result<()> {
    require!(
        vault_name.len() <= MAX_VAULT_NAME_LEN,
        PayFlowError::VaultNameTooLong
    );

    let vault = &mut ctx.accounts.vault;

    vault.employer = ctx.accounts.employer.key();
    vault.compliance_officer = ctx.accounts.compliance_officer.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.vault_name = vault_name;
    vault.total_deposited = 0;
    vault.total_disbursed = 0;
    vault.recipient_count = 0;
    vault.bump = ctx.bumps.vault;

    msg!(
        "PayFlow vault '{}' initialized by employer {}",
        vault.vault_name,
        vault.employer
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(vault_name: String)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,
    pub compliance_officer: UncheckedAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = employer,
        space = PayrollVault::max_space(),
        seeds = [VAULT_SEED, employer.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PayrollVault>,

    #[account(
        init,
        payer = employer,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}