use anchor_lang::prelude::*;

use crate::constants::{RECIPIENT_SEED, VAULT_SEED};
use crate::errors::PayFlowError;
use crate::state::{PayrollVault, RecipientAccount};

pub fn handler(ctx: Context<RemoveRecipient>) -> Result<()> {
    ctx.accounts.vault.recipient_count = ctx.accounts.vault
        .recipient_count
        .saturating_sub(1);

    msg!(
        "Recipient {} removed from vault '{}'. Rent returned to compliance officer.",
        ctx.accounts.recipient.worker_wallet,
        ctx.accounts.vault.vault_name
    );

    // The account is closed via `close = compliance_officer` in the constraint.
    // Rent lamports are returned to the compliance officer.
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveRecipient<'info> {
    #[account(mut)]
    pub compliance_officer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.employer.as_ref()],
        bump = vault.bump,
        has_one = compliance_officer @ PayFlowError::UnauthorizedComplianceOfficer,
    )]
    pub vault: Account<'info, PayrollVault>,

    #[account(
        mut,
        seeds = [RECIPIENT_SEED, vault.key().as_ref(), recipient.worker_wallet.as_ref()],
        bump = recipient.bump,
        has_one = vault,
        close = compliance_officer
    )]
    pub recipient: Account<'info, RecipientAccount>,
}