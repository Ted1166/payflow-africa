use anchor_lang::prelude::*;

use crate::constants::{RECIPIENT_SEED, VAULT_SEED};
use crate::errors::PayFlowError;
use crate::state::{PayrollVault, RecipientAccount};

pub fn handler(ctx: Context<BlacklistRecipient>) -> Result<()> {
    require!(
        !ctx.accounts.recipient.is_blacklisted,
        PayFlowError::AlreadyBlacklisted
    );

    let recipient = &mut ctx.accounts.recipient;
    recipient.is_blacklisted = true;
    recipient.is_paused = true;

    msg!(
        "Recipient {} has been PERMANENTLY BLACKLISTED on vault {}.",
        recipient.worker_wallet,
        recipient.vault
    );

    Ok(())
}

#[derive(Accounts)]
pub struct BlacklistRecipient<'info> {
    pub compliance_officer: Signer<'info>,

    #[account(
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
    )]
    pub recipient: Account<'info, RecipientAccount>,
}