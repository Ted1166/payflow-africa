import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export const PROGRAM_ID = new PublicKey('AMY97PPq8avNiNsEWsNiyMHZjfydLomUvzwKsWp4VJrF');

// Seeds — must match program exactly
export const VAULT_SEED = Buffer.from('payroll_vault');
export const RECIPIENT_SEED = Buffer.from('recipient');
export const TRAVEL_RULE_SEED = Buffer.from('travel_rule');

export const USDC_DECIMALS = 6;
export const LAMPORTS_PER_SOL = 1_000_000_000;

export function findVaultPDA(employer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, employer.toBuffer()],
    PROGRAM_ID
  );
}

export function findRecipientPDA(vault: PublicKey, worker: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [RECIPIENT_SEED, vault.toBuffer(), worker.toBuffer()],
    PROGRAM_ID
  );
}

export function findTravelRulePDA(vault: PublicKey, recipient: PublicKey, index: number): [PublicKey, number] {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync(
    [TRAVEL_RULE_SEED, vault.toBuffer(), recipient.toBuffer(), buf],
    PROGRAM_ID
  );
}

export function rawToUi(raw: BN | number | bigint): string {
  const n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'number' ? raw : raw.toNumber();
  return (n / Math.pow(10, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function uiToRaw(amount: string | number): BN {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new BN(Math.floor(n * Math.pow(10, USDC_DECIMALS)));
}

export function shortKey(key: PublicKey | string): string {
  const s = key.toString();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function kycLabel(verified: boolean, paused: boolean, blacklisted: boolean): {
  label: string; color: string; bg: string;
} {
  if (blacklisted) return { label: 'Blacklisted', color: 'var(--red)', bg: 'var(--red-dim)' };
  if (paused) return { label: 'AML Hold', color: 'var(--amber)', bg: 'var(--amber-dim)' };
  if (verified) return { label: 'KYC Verified', color: 'var(--green)', bg: 'var(--green-dim)' };
  return { label: 'KYC Pending', color: 'var(--gold)', bg: 'var(--gold-glow)' };
}
