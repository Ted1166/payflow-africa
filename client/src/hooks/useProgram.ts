import { useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { findVaultPDA, findRecipientPDA, findTravelRulePDA, PROGRAM_ID } from '../utils/program';
import BN from 'bn.js';

import IDL from '../idl/payflow_africa.json';

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const getProgram = useCallback((): anchor.Program | null => {
    if (!wallet.publicKey || !wallet.signTransaction || !IDL) return null;

    const provider = new anchor.AnchorProvider(
      connection,
      wallet as unknown as anchor.Wallet,
      { commitment: 'confirmed', preflightCommitment: 'confirmed' }
    );

    return new anchor.Program(IDL as any, provider);
  }, [connection, wallet]);

  const initializeVault = useCallback(async (
    vaultName: string,
    complianceOfficer: PublicKey,
    usdcMint: PublicKey,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const [vaultPDA] = findVaultPDA(wallet.publicKey);
    const vaultTokenAccount = await getAssociatedTokenAddress(usdcMint, vaultPDA, true);

    const tx = await program.methods
      .initializeVault(vaultName)
      .accounts({
        employer: wallet.publicKey,
        complianceOfficer,
        usdcMint,
        vault: vaultPDA,
        vaultTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    return { tx, vaultPDA };
  }, [getProgram, wallet.publicKey]);

  const deposit = useCallback(async (
    vaultPDA: PublicKey,
    usdcMint: PublicKey,
    employerTokenAccount: PublicKey,
    amount: BN,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const vaultTokenAccount = await getAssociatedTokenAddress(usdcMint, vaultPDA, true);

    const tx = await program.methods
      .deposit(amount)
      .accounts({
        vault: vaultPDA,
        vaultTokenAccount,
        employerTokenAccount,
        usdcMint,
        employer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as never)
      .rpc();

    return { tx };
  }, [getProgram, wallet.publicKey]);

  const addRecipient = useCallback(async (
    vaultPDA: PublicKey,
    workerWallet: PublicKey,
    amountPerDisbursement: BN,
    senderName: string,
    receiverName: string,
    senderVasp: string,
    receiverVasp: string,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const [recipientPDA] = findRecipientPDA(vaultPDA, workerWallet);

    const tx = await program.methods
      .addRecipient(amountPerDisbursement, senderName, receiverName, senderVasp, receiverVasp)
      .accounts({
        complianceOfficer: wallet.publicKey,
        vault: vaultPDA,
        workerWallet,
        recipient: recipientPDA,
        systemProgram: SystemProgram.programId,
      } as never)
      .rpc();

    return { tx, recipientPDA };
  }, [getProgram, wallet.publicKey]);

  const updateKycStatus = useCallback(async (
    vaultPDA: PublicKey,
    recipientPDA: PublicKey,
    verified: boolean,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const tx = await program.methods
      .updateKycStatus(verified)
      .accounts({
        complianceOfficer: wallet.publicKey,
        vault: vaultPDA,
        recipient: recipientPDA,
      } as never)
      .rpc();

    return { tx };
  }, [getProgram, wallet.publicKey]);

  const disburse = useCallback(async (
    vaultPDA: PublicKey,
    recipientPDA: PublicKey,
    workerWallet: PublicKey,
    usdcMint: PublicKey,
    disbursementIndex: number,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const vaultTokenAccount = await getAssociatedTokenAddress(usdcMint, vaultPDA, true);
    const workerTokenAccount = await getAssociatedTokenAddress(usdcMint, workerWallet);
    const [travelRulePDA] = findTravelRulePDA(vaultPDA, recipientPDA, disbursementIndex);

    const tx = await program.methods
      .disburse(disbursementIndex)
      .accounts({
        employer: wallet.publicKey,
        vault: vaultPDA,
        vaultTokenAccount,
        recipient: recipientPDA,
        workerTokenAccount,
        travelRuleRecord: travelRulePDA,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as never)
      .rpc();

    return { tx, travelRulePDA };
  }, [getProgram, wallet.publicKey]);

  const setRecipientPause = useCallback(async (
    vaultPDA: PublicKey,
    recipientPDA: PublicKey,
    paused: boolean,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const tx = await program.methods
      .setRecipientPause(paused)
      .accounts({
        complianceOfficer: wallet.publicKey,
        vault: vaultPDA,
        recipient: recipientPDA,
      } as never)
      .rpc();

    return { tx };
  }, [getProgram, wallet.publicKey]);

  const blacklistRecipient = useCallback(async (
    vaultPDA: PublicKey,
    recipientPDA: PublicKey,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const tx = await program.methods
      .blacklistRecipient()
      .accounts({
        complianceOfficer: wallet.publicKey,
        vault: vaultPDA,
        recipient: recipientPDA,
      } as never)
      .rpc();

    return { tx };
  }, [getProgram, wallet.publicKey]);

  const removeRecipient = useCallback(async (
    vaultPDA: PublicKey,
    recipientPDA: PublicKey,
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

    const tx = await program.methods
      .removeRecipient()
      .accounts({
        complianceOfficer: wallet.publicKey,
        vault: vaultPDA,
        recipient: recipientPDA,
      } as never)
      .rpc();

    return { tx };
  }, [getProgram, wallet.publicKey]);

  const fetchVault = useCallback(async (vaultPDA: PublicKey) => {
    const program = getProgram();
    if (!program) return null;
    try {
      return await (program.account as any)['payrollVault'].fetch(vaultPDA);
    } catch {
      return null;
    }
  }, [getProgram]);

  const fetchRecipient = useCallback(async (recipientPDA: PublicKey) => {
    const program = getProgram();
    if (!program) return null;
    try {
      return await (program.account as any)['recipientAccount'].fetch(recipientPDA);
    } catch {
      return null;
    }
  }, [getProgram]);

  const fetchTravelRule = useCallback(async (travelRulePDA: PublicKey) => {
    const program = getProgram();
    if (!program) return null;
    try {
      return await (program.account as any)['travelRuleRecord'].fetch(travelRulePDA);
    } catch {
      return null;
    }
  }, [getProgram]);

  const isReady = !!wallet.publicKey && !!IDL;

  return {
    isReady,
    programId: PROGRAM_ID,
    initializeVault,
    deposit,
    addRecipient,
    updateKycStatus,
    disburse,
    setRecipientPause,
    blacklistRecipient,
    removeRecipient,
    fetchVault,
    fetchRecipient,
    fetchTravelRule,
  };
}
