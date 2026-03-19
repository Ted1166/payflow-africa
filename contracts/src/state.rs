use anchor_lang::prelude::*;
use crate::constants::*;


#[account]
pub struct PayrollVault {
    pub employer: Pubkey,
    pub compliance_officer: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub vault_name: String,
    pub total_deposited: u64,
    pub total_disbursed: u64,
    pub recipient_count: u32,
    pub bump: u8,
}

impl PayrollVault {
    pub fn space(vault_name: &str) -> usize {
        8               // discriminator
        + 32            // employer
        + 32            // compliance_officer
        + 32            // usdc_mint
        + 32            // vault_token_account
        + 4 + vault_name.len() // vault_name string
        + 8             // total_deposited
        + 8             // total_disbursed
        + 4             // recipient_count
        + 1             // bump
    }

    pub fn max_space() -> usize {
        8 + 32 + 32 + 32 + 32 + (4 + MAX_VAULT_NAME_LEN) + 8 + 8 + 4 + 1
    }
}

#[account]
pub struct RecipientAccount {
    pub vault: Pubkey,
    pub worker_wallet: Pubkey,
    pub amount_per_disbursement: u64,
    pub kyc_verified: bool,
    pub is_paused: bool,
    pub is_blacklisted: bool,
    pub total_received: u64,
    pub disbursement_count: u32,
    pub last_disbursed_at: i64,
    pub sender_name: String,
    pub receiver_name: String,
    pub sender_vasp: String,
    pub receiver_vasp: String,
    pub bump: u8,
}

impl RecipientAccount {
    pub fn space(
        sender_name: &str,
        receiver_name: &str,
        sender_vasp: &str,
        receiver_vasp: &str,
    ) -> usize {
        8
        + 32
        + 32
        + 8
        + 1
        + 1
        + 1
        + 8
        + 4
        + 8
        + 4 + sender_name.len()
        + 4 + receiver_name.len()
        + 4 + sender_vasp.len()
        + 4 + receiver_vasp.len()
        + 1
    }

    pub fn max_space() -> usize {
        8 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 4 + 8
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_VASP_LEN)
        + (4 + MAX_VASP_LEN)
        + 1
    }
}


#[account]
pub struct TravelRuleRecord {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub worker_wallet: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub disbursement_index: u32,
    pub sender_name: String,
    pub receiver_name: String,
    pub sender_vasp: String,
    pub receiver_vasp: String,
    pub bump: u8,
}

impl TravelRuleRecord {
    pub fn max_space() -> usize {
        8
        + 32
        + 32
        + 32
        + 8
        + 8
        + 4
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_VASP_LEN)
        + (4 + MAX_VASP_LEN)
        + 1
    }
}