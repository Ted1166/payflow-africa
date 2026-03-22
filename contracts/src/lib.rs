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

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_name: String,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, vault_name)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

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

    pub fn update_kyc_status(
        ctx: Context<UpdateKycStatus>,
        verified: bool,
    ) -> Result<()> {
        instructions::update_kyc_status::handler(ctx, verified)
    }

    pub fn set_recipient_pause(
        ctx: Context<SetRecipientPause>,
        paused: bool,
    ) -> Result<()> {
        instructions::set_recipient_pause::handler(ctx, paused)
    }


    pub fn blacklist_recipient(ctx: Context<BlacklistRecipient>) -> Result<()> {
        instructions::blacklist_recipient::handler(ctx)
    }


    pub fn disburse(ctx: Context<Disburse>, disbursement_index: u32) -> Result<()> {
        instructions::disburse::handler(ctx, disbursement_index)
    }

    pub fn remove_recipient(ctx: Context<RemoveRecipient>) -> Result<()> {
        instructions::remove_recipient::handler(ctx)
    }
}