use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayFlowError;
use crate::state::{PayrollVault, RecipientAccount};

pub fn handler(
    ctx: Context<AddRecipient>,
    amount_per_disbursement: u64,
    sender_name: String,
    receiver_name: String,
    sender_vasp: String,
    receiver_vasp: String,
) -> Result<()> {
    require!(amount_per_disbursement > 0, PayFlowError::InvalidDisbursementAmount);
    require!(sender_name.len() <= MAX_NAME_LEN, PayFlowError::NameTooLong);
    require!(receiver_name.len() <= MAX_NAME_LEN, PayFlowError::NameTooLong);
    require!(sender_vasp.len() <= MAX_VASP_LEN, PayFlowError::VaspTooLong);
    require!(receiver_vasp.len() <= MAX_VASP_LEN, PayFlowError::VaspTooLong);

    let recipient = &mut ctx.accounts.recipient;

    recipient.vault = ctx.accounts.vault.key();
    recipient.worker_wallet = ctx.accounts.worker_wallet.key();
    recipient.amount_per_disbursement = amount_per_disbursement;
    recipient.kyc_verified = false;
    recipient.is_paused = false;
    recipient.is_blacklisted = false;
    recipient.total_received = 0;
    recipient.disbursement_count = 0;
    recipient.last_disbursed_at = 0;
    recipient.sender_name = sender_name;
    recipient.receiver_name = receiver_name;
    recipient.sender_vasp = sender_vasp;
    recipient.receiver_vasp = receiver_vasp;
    recipient.bump = ctx.bumps.recipient;

    ctx.accounts.vault.recipient_count = ctx.accounts.vault
        .recipient_count
        .saturating_add(1);

    msg!(
        "Recipient {} added to vault '{}'. KYC pending.",
        recipient.worker_wallet,
        ctx.accounts.vault.vault_name
    );

    Ok(())
}

#[derive(Accounts)]
pub struct AddRecipient<'info> {
    #[account(mut)]
    pub compliance_officer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.employer.as_ref()],
        bump = vault.bump,
        has_one = compliance_officer @ PayFlowError::UnauthorizedComplianceOfficer,
    )]
    pub vault: Account<'info, PayrollVault>,

    pub worker_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = compliance_officer,
        space = RecipientAccount::max_space(),
        seeds = [RECIPIENT_SEED, vault.key().as_ref(), worker_wallet.key().as_ref()],
        bump
    )]
    pub recipient: Account<'info, RecipientAccount>,

    pub system_program: Program<'info, System>,
}
