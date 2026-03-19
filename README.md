# PayFlow Africa

**Compliant Programmable Payroll Infrastructure on Solana**

PayFlow Africa is an institutional-grade stablecoin payroll and cross-border disbursement platform built on Solana. It enables African businesses to pay workers in USDC with full regulatory compliance baked in at the smart contract level - KYC gating, AML controls, Travel Rule metadata, and on-chain audit trails - without relying on any off-chain database.

---

## The Problem

Across Kenya, Nigeria, Uganda, and Ghana, tens of millions of workers are paid late, in cash, with no financial trail. Cross-border payroll is worse - fees of 5-10%, multi-day delays, and no compliance infrastructure. Existing crypto solutions skip regulation entirely, making them unusable by any regulated employer or financial institution.

PayFlow Africa solves this: a compliant, programmable payroll vault on Solana where employers lock USDC, workers get paid on schedule, and every disbursement writes an immutable Travel Rule record on-chain.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PayFlow Africa                           │
│                                                             │
│  Employer Dashboard          Worker Portal                  │
│  ─────────────────           ──────────────                 │
│  • Initialize vault          • View KYC status              │
│  • Deposit USDC              • Payment history              │
│  • Add workers               • Blink payment URL            │
│  • Verify KYC                • QR code generation           │
│  • Disburse payments         • Travel Rule records          │
│  • AML hold / blacklist                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    Anchor Program
                    (Solana Devnet)
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
   PayrollVault      RecipientAccount    TravelRuleRecord
      (PDA)               (PDA)              (PDA)
```

### On-Chain Program

Program ID: `AMY97PPq8avNiNsEWsNiyMHZjfydLomUvzwKsWp4VJrF`

Network: Solana Devnet

Built with Anchor `0.30.1` / Rust.

#### Account Structure

**PayrollVault PDA** - seeds: `[payroll_vault, employer_pubkey]`

Stores the employer's vault state: total deposited, total disbursed, recipient count, compliance officer pubkey, and USDC token account reference.

**RecipientAccount PDA** - seeds: `[recipient, vault_pubkey, worker_pubkey]`

One per worker. Stores KYC status, AML pause/blacklist flags, disbursement amount, Travel Rule metadata (sender name, receiver name, sender VASP, receiver VASP), and full disbursement history counters.

**TravelRuleRecord PDA** - seeds: `[travel_rule, vault_pubkey, recipient_pubkey, disbursement_index_le_bytes]`

Written once per disbursement. Immutable. Contains sender name, receiver name, sender VASP, receiver VASP, amount, timestamp, and disbursement index. Permanently auditable on-chain — no off-chain database required.

#### Instructions

| Instruction | Signer | Description |
|---|---|---|
| `initialize_vault` | Employer | Creates vault PDA + USDC token account |
| `deposit` | Employer | Transfers USDC from employer ATA to vault |
| `add_recipient` | Compliance Officer | Registers a worker with Travel Rule metadata |
| `update_kyc_status` | Compliance Officer | Sets KYC verified flag per recipient |
| `disburse` | Employer | Transfers USDC to worker + writes Travel Rule PDA |
| `set_recipient_pause` | Compliance Officer | AML hold — blocks disbursements |
| `blacklist_recipient` | Compliance Officer | Permanent block on all operations |
| `remove_recipient` | Compliance Officer | Closes PDA, returns rent |

---

## Compliance Layer

Every instruction enforces regulatory requirements at the smart contract level. There is no way to bypass them, they are encoded in Rust and deployed on-chain.

### KYC (Know Your Customer)

Workers are registered with `kyc_verified = false`. The compliance officer must explicitly call `update_kyc_status` to verify. Any disbursement attempted before KYC is verified fails with `KycNotVerified`. KYC can be revoked at any time.

### KYT (Know Your Transaction)

Every `disburse` instruction writes a `TravelRuleRecord` PDA on-chain. The record includes the full structured metadata for that transaction: sender identity, receiver identity, VASP identifiers, amount in raw USDC units, and Unix timestamp. These records are immutable and indexed by disbursement index, making full transaction histories reconstructable from chain state alone.

### AML (Anti-Money Laundering)

The compliance officer can place an AML hold on any recipient at any time using `set_recipient_pause`. Held recipients cannot receive disbursements until the hold is lifted. The blacklist is permanent - once a recipient is blacklisted, all operations (disburse, KYC update, re-blacklist) fail with `RecipientBlacklisted` or `AlreadyBlacklisted`.

### Travel Rule

Every disbursement above threshold logs a structured `TravelRuleRecord` containing:

```
sender_name    : String  - e.g. "Acme Kenya Ltd"
receiver_name  : String  - e.g. "John Kamau"
sender_vasp    : String  - e.g. "PayFlow Africa / KE"
receiver_vasp  : String  - e.g. "M-Pesa / KE"
amount         : u64     - raw USDC (6 decimals)
timestamp      : i64     - Unix timestamp
disbursement_index : u32 - sequential, per-recipient
```

PDA seeds ensure each record is uniquely addressable and can be fetched by anyone for audit purposes.

---

## How It Works

### Employer Flow

1. Connect Phantom or Solflare wallet on Solana Devnet
2. Initialize a payroll vault — names the vault, sets a compliance officer, creates a USDC token account owned by the vault PDA
3. Deposit USDC from the employer's associated token account into the vault
4. Add workers — each worker registration requires full Travel Rule data: sender name, receiver name, sender VASP, receiver VASP, and amount per disbursement
5. Workers start with `kyc_verified = false` and cannot receive payments yet
6. Compliance officer verifies KYC per worker — flipping the flag on-chain
7. Employer triggers disbursement — USDC flows from vault to worker's token account, Travel Rule PDA is written
8. Compliance officer can place AML holds or permanently blacklist workers at any time

### Worker Flow

1. Connect wallet on the Worker tab
2. A Blink URL is automatically generated: `https://payflow-africa.app/api/actions/pay/{wallet_pubkey}`
3. Share the Blink URL or QR code with the employer to trigger payment
4. Look up any vault by employer wallet address — the app derives the vault PDA and fetches the recipient account
5. View real-time compliance status: KYC Verified, KYC Pending, AML Hold, or Blacklisted
6. View full disbursement history with Travel Rule PDA addresses for each payment

### Blink Integration

PayFlow Africa implements the [Solana Actions](https://solana.com/docs/advanced/actions) spec. Each worker's payment URL is a valid Blink endpoint. When an employer scans or clicks the Blink:

- The action endpoint verifies KYC status on-chain
- Constructs the `disburse` transaction with correct accounts
- Returns a transaction for the employer to sign
- On confirmation, USDC is transferred and a Travel Rule PDA is written

Workers in Kenya, Nigeria, or Uganda never need to know what Solana is. They receive a WhatsApp link, tap it, and get paid.

---

## Advantages

### vs. Traditional Payroll (Banks, Mobile Money)

| | Traditional | PayFlow Africa |
|---|---|---|
| Settlement time | 1–5 days | ~400ms (Solana finality) |
| Cross-border fees | 5–10% | < 0.01 SOL per transaction |
| Compliance records | Off-chain, siloed | On-chain, immutable, public |
| Auditability | Requires database access | Anyone can verify on-chain |
| Censorship risk | High (bank account freezes) | AML controls are transparent |

### vs. Generic Crypto Payments

| | Generic Crypto | PayFlow Africa |
|---|---|---|
| KYC enforcement | None | On-chain, mandatory |
| Travel Rule | None | Immutable PDA per disbursement |
| AML controls | None | Pause / blacklist at instruction level |
| Institutional fit | Low | Production-ready for regulated entities |
| Audit trail | Partial (tx history only) | Structured metadata per payment |

### Technical Advantages

**No off-chain database.** All compliance state - KYC flags, AML holds, Travel Rule records - lives on-chain in PDAs. A regulator can audit the entire payment history of any vault using only the program ID and a Solana RPC node.

**Role separation.** Employer and compliance officer are distinct signers. An employer cannot bypass KYC or AML controls without the compliance officer's signature. This mirrors the separation of duties required by financial regulations.

**Immutable Travel Rule records.** Each `TravelRuleRecord` PDA is initialized once and never modified. The `init` constraint on the account means attempting to overwrite a record fails at the program level. Disbursement indices are sequential and enforced - gaps or replays are impossible.

**Solana performance.** 400ms finality, sub-cent transaction fees, and 65,000 TPS capacity make PayFlow Africa viable for high-frequency payroll at scale - weekly payroll runs for 10,000 workers cost less than $1 in network fees.

**Blinks UX.** The Solana Actions integration means employers can trigger payments from a simple URL or QR code. No wallet UI required for the payment trigger - the employer scans, approves in Phantom, done.

---

## Project Structure

```
payflow-africa/
├── contracts/                  # Anchor program (Rust)
│   ├── src/
│   │   ├── lib.rs              # Program entrypoint
│   │   ├── state.rs            # Account structures
│   │   ├── errors.rs           # Custom error codes
│   │   ├── constants.rs        # Seeds, thresholds
│   │   └── instructions/
│   │       ├── initialize_vault.rs
│   │       ├── deposit.rs
│   │       ├── add_recipient.rs
│   │       ├── update_kyc_status.rs
│   │       ├── disburse.rs
│   │       ├── set_recipient_pause.rs
│   │       ├── blacklist_recipient.rs
│   │       └── remove_recipient.rs
│   └── tests/
│       └── payflow-africa.ts   # Full test suite (19/19 passing)
│
└── client/                     # React + Vite frontend
    ├── src/
    │   ├── components/
    │   │   ├── EmployerDashboard.tsx
    │   │   ├── WorkerView.tsx
    │   │   ├── Toast.tsx
    │   │   └── QRCode.tsx
    │   ├── hooks/
    │   │   └── useProgram.ts   # Anchor instruction wrappers
    │   ├── utils/
    │   │   └── program.ts      # PDA derivation, helpers
    │   ├── idl/
    │   │   └── payflow_africa.json
    │   └── App.tsx
    └── public/
        └── logo.svg
```

---

## Running Locally

### Prerequisites

- Rust + Solana CLI (`solana --version >= 1.18`)
- Anchor CLI (`anchor --version`)
- Node.js >= 18
- Phantom or Solflare browser extension set to Devnet

### Contracts

```bash
cd contracts
anchor build
anchor deploy --provider.cluster devnet
```

### Tests

```bash
# Start local validator
solana-test-validator --reset

# In another terminal
cd contracts
anchor deploy
anchor test --skip-local-validator --skip-deploy
```

All 19 tests pass:
- Vault initialization and validation
- USDC deposit with zero-amount rejection
- Recipient registration with Travel Rule data
- KYC gate — blocks disbursement before verification
- Full disburse flow with Travel Rule PDA verification
- AML pause / unpause cycle
- Blacklist — blocks disburse, KYC update, re-blacklisting
- Recipient removal with rent reclaim
- Insufficient vault balance rejection

### Frontend

```bash
cd client
npm install --legacy-peer-deps
cp ../contracts/target/idl/payflow_africa.json src/idl/
npm run dev
```

Open `http://localhost:5173`. Connect Phantom on Devnet.

---

## Hackathon Tracks

**StableHacks 2026** — Programmable Stablecoin Payments + Cross-Border Stablecoin Treasury

PayFlow Africa directly addresses both tracks: programmable vault-based disbursements with full Travel Rule compliance, targeting the African cross-border payroll corridor. The compliance architecture (KYC gating, KYT metadata, AML controls, Travel Rule PDAs) satisfies all mandatory prerequisites defined by AMINA Bank and the Solana Foundation.

**Solana LATAM Hackathon 2026** — Blinks + Blue Sky

The Blink integration makes this a clean fit for the Blinks category: each worker's payment URL is a valid Solana Action endpoint that any employer can trigger from a link or QR code, with no wallet UI required on the triggering side.

---

## Team

Solo submission — built by one Solana/Anchor developer in 7 days.

---

## License

MIT