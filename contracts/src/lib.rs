use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::initialize_vault::*;
use instructions::deposit::*;
use instructions::add_recipient::*;
use instructions::update_kyc_status::*;
use instructions::set_recipient_pause::*;
use instructions::blacklist_recipient::*;
use instructions::disburse::*;
use instructions::remove_recipient::*;

declare_id!("AMY97PPq8avNiNsEWsNiyMHZjfydLomUvzwKsWp4VJrF");

#[program]
pub mod payflow_africa {
    use super::*;

    /// Employer creates a payroll vault — one vault per employer.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_name: String,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, vault_name)
    }

    /// Employer deposits USDC into their vault.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Compliance officer adds a worker recipient to a vault.
    /// KYC is set to false by default — must be explicitly verified.
    pub fn add_recipient(
        ctx: Context<AddRecipient>,
        amount_per_disbursement: u64,
        sender_name: String,
        receiver_name: String,
        sender_vasp: String,
        receiver_vasp: String,
    ) -> Result<()> {
        instructions::add_recipient::handler(
            ctx,
            amount_per_disbursement,
            sender_name,
            receiver_name,
            sender_vasp,
            receiver_vasp,
        )
    }

    /// Compliance officer flips the KYC verified flag for a recipient.
    pub fn update_kyc_status(
        ctx: Context<UpdateKycStatus>,
        verified: bool,
    ) -> Result<()> {
        instructions::update_kyc_status::handler(ctx, verified)
    }

    /// Compliance officer pauses / unpauses a recipient (soft AML hold).
    pub fn set_recipient_pause(
        ctx: Context<SetRecipientPause>,
        paused: bool,
    ) -> Result<()> {
        instructions::set_recipient_pause::handler(ctx, paused)
    }

    /// Compliance officer permanently blacklists a recipient wallet.
    /// Irreversible — use with care.
    pub fn blacklist_recipient(ctx: Context<BlacklistRecipient>) -> Result<()> {
        instructions::blacklist_recipient::handler(ctx)
    }

    /// Employer or an authorised crank triggers a disbursement.
    /// Writes an on-chain Travel Rule record as a PDA.
    pub fn disburse(ctx: Context<Disburse>, disbursement_index: u32) -> Result<()> {
        instructions::disburse::handler(ctx, disbursement_index)
    }

    /// Employer removes a recipient from the vault (closes their PDA).
    pub fn remove_recipient(ctx: Context<RemoveRecipient>) -> Result<()> {
        instructions::remove_recipient::handler(ctx)
    }
}