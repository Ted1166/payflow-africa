use anchor_lang::prelude::*;

#[error_code]
pub enum PayFlowError {
    // --- KYC / Compliance ---
    #[msg("Recipient has not completed KYC verification.")]
    KycNotVerified,

    #[msg("Recipient wallet is currently paused by compliance.")]
    RecipientPaused,

    #[msg("Recipient wallet has been permanently blacklisted.")]
    RecipientBlacklisted,

    // --- Vault ---
    #[msg("Vault has insufficient USDC balance for this disbursement.")]
    InsufficientVaultBalance,

    #[msg("Only the vault employer can perform this action.")]
    UnauthorizedEmployer,

    #[msg("Only the vault's compliance officer can perform this action.")]
    UnauthorizedComplianceOfficer,

    #[msg("Vault name exceeds the maximum allowed length (50 chars).")]
    VaultNameTooLong,

    // --- Recipient ---
    #[msg("Disbursement amount must be greater than zero.")]
    InvalidDisbursementAmount,

    #[msg("Recipient is already blacklisted — cannot modify.")]
    AlreadyBlacklisted,

    // --- String validation ---
    #[msg("Name field exceeds maximum allowed length (64 chars).")]
    NameTooLong,

    #[msg("VASP identifier field exceeds maximum allowed length (64 chars).")]
    VaspTooLong,
}