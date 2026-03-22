use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::PayFlowError;
use crate::state::{PayrollVault, RecipientAccount, TravelRuleRecord};

pub fn handler(ctx: Context<Disburse>, disbursement_index: u32) -> Result<()> {
    let recipient = &ctx.accounts.recipient;

    require!(!recipient.is_blacklisted, PayFlowError::RecipientBlacklisted);
    require!(!recipient.is_paused, PayFlowError::RecipientPaused);
    require!(recipient.kyc_verified, PayFlowError::KycNotVerified);

    let amount = recipient.amount_per_disbursement;
    require!(amount > 0, PayFlowError::InvalidDisbursementAmount);

    require!(
        disbursement_index == ctx.accounts.recipient.disbursement_count,
        PayFlowError::InvalidDisbursementAmount
    );

    require!(
        ctx.accounts.vault_token_account.amount >= amount,
        PayFlowError::InsufficientVaultBalance
    );

    let employer_key = ctx.accounts.vault.employer;
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        employer_key.as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer_seeds = &[vault_seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.worker_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    let vault = &mut ctx.accounts.vault;
    vault.total_disbursed = vault.total_disbursed.saturating_add(amount);

    let recipient_key = ctx.accounts.recipient.key();
    let worker_wallet = ctx.accounts.recipient.worker_wallet;

    let recipient = &mut ctx.accounts.recipient;
    let disbursement_index = recipient.disbursement_count;
    recipient.total_received = recipient.total_received.saturating_add(amount);
    recipient.disbursement_count = recipient.disbursement_count.saturating_add(1);
    recipient.last_disbursed_at = Clock::get()?.unix_timestamp;

    let travel_rule = &mut ctx.accounts.travel_rule_record;
    travel_rule.vault = ctx.accounts.vault.key();
    travel_rule.recipient = recipient_key;
    travel_rule.worker_wallet = worker_wallet;
    travel_rule.amount = amount;
    travel_rule.timestamp = recipient.last_disbursed_at;
    travel_rule.disbursement_index = disbursement_index;
    travel_rule.sender_name = recipient.sender_name.clone();
    travel_rule.receiver_name = recipient.receiver_name.clone();
    travel_rule.sender_vasp = recipient.sender_vasp.clone();
    travel_rule.receiver_vasp = recipient.receiver_vasp.clone();
    travel_rule.bump = ctx.bumps.travel_rule_record;

    if amount >= TRAVEL_RULE_THRESHOLD {
        msg!(
            "[TRAVEL RULE] Disbursement #{} — {} USDC (raw) from '{}' ({}) to '{}' ({}) at wallet {}",
            disbursement_index,
            amount,
            travel_rule.sender_name,
            travel_rule.sender_vasp,
            travel_rule.receiver_name,
            travel_rule.receiver_vasp,
            travel_rule.worker_wallet,
        );
    } else {
        msg!(
            "Disbursement #{} — {} USDC (raw) → {} (below Travel Rule threshold)",
            disbursement_index,
            amount,
            travel_rule.worker_wallet,
        );
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(disbursement_index: u32)]
pub struct Disburse<'info> {
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

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [RECIPIENT_SEED, vault.key().as_ref(), recipient.worker_wallet.as_ref()],
        bump = recipient.bump,
        has_one = vault,
    )]
    pub recipient: Account<'info, RecipientAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = recipient.worker_wallet,
    )]
    pub worker_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = employer,
        space = TravelRuleRecord::max_space(),
        seeds = [
            TRAVEL_RULE_SEED,
            vault.key().as_ref(),
            recipient.key().as_ref(),
            &disbursement_index.to_le_bytes(),
        ],
        bump
    )]
    pub travel_rule_record: Box<Account<'info, TravelRuleRecord>>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}