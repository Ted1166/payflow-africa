import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PayflowAfrica } from "../target/types/payflow_africa";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";


const VAULT_SEED = Buffer.from("payroll_vault");
const RECIPIENT_SEED = Buffer.from("recipient");
const TRAVEL_RULE_SEED = Buffer.from("travel_rule");
const USDC_DECIMALS = 6;
const ONE_USDC = new BN(1_000_000);
const FIVE_HUNDRED_USDC = ONE_USDC.muln(500);
const THOUSAND_USDC = ONE_USDC.muln(1000);

function uiToRaw(amount: number): BN {
  return new BN(amount * Math.pow(10, USDC_DECIMALS));
}
function findVaultPDA(employer: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, employer.toBuffer()], programId);
}
function findRecipientPDA(vault: PublicKey, worker: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([RECIPIENT_SEED, vault.toBuffer(), worker.toBuffer()], programId);
}
function findTravelRulePDA(vault: PublicKey, recipient: PublicKey, index: number, programId: PublicKey): [PublicKey, number] {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync([TRAVEL_RULE_SEED, vault.toBuffer(), recipient.toBuffer(), buf], programId);
}

describe("payflow-africa", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PayflowAfrica as Program<PayflowAfrica>;
  const connection = provider.connection;


  const employer = (provider.wallet as anchor.Wallet).payer;
  const complianceOfficer = Keypair.generate();
  const worker1 = Keypair.generate();
  const worker2 = Keypair.generate();

  let usdcMint: PublicKey;
  let employerTokenAccount: PublicKey;
  let vaultPDA: PublicKey;
  let recipient1PDA: PublicKey;
  let worker1TokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;

  before(async () => {
    console.log("\n=== Setting up test environment ===");

    for (const kp of [complianceOfficer, worker1]) {
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: employer.publicKey,
          toPubkey: kp.publicKey,
          lamports: 0.1e9,
        })
      );
      await provider.sendAndConfirm(tx, [employer]);
    }

    usdcMint = await createMint(connection, employer, employer.publicKey, null, USDC_DECIMALS);

    employerTokenAccount = await createAssociatedTokenAccount(connection, employer, usdcMint, employer.publicKey);
    await mintTo(connection, employer, usdcMint, employerTokenAccount, employer, uiToRaw(10_000).toNumber());

    [vaultPDA] = findVaultPDA(employer.publicKey, program.programId);
    [recipient1PDA] = findRecipientPDA(vaultPDA, worker1.publicKey, program.programId);

    vaultTokenAccount = await anchor.utils.token.associatedAddress({ mint: usdcMint, owner: vaultPDA });

    worker1TokenAccount = await createAssociatedTokenAccount(connection, worker1, usdcMint, worker1.publicKey);

    console.log("Employer:", employer.publicKey.toBase58());
    console.log("Vault PDA:", vaultPDA.toBase58());
    console.log("=== Setup complete ===\n");
  });

  // ---------------------------------------------------------------------------
  // 1. initialize_vault
  // ---------------------------------------------------------------------------
  describe("initialize_vault", () => {
    it("creates a vault with correct state", async () => {
      await program.methods
        .initializeVault("Acme Kenya Payroll")
        .accounts({
          employer: employer.publicKey,
          complianceOfficer: complianceOfficer.publicKey,
          usdcMint,
        })
        .signers([employer])
        .rpc();

      const vault = await program.account.payrollVault.fetch(vaultPDA);
      assert.equal(vault.employer.toBase58(), employer.publicKey.toBase58());
      assert.equal(vault.complianceOfficer.toBase58(), complianceOfficer.publicKey.toBase58());
      assert.equal(vault.vaultName, "Acme Kenya Payroll");
      assert.equal(vault.totalDeposited.toNumber(), 0);
      assert.equal(vault.recipientCount, 0);
      console.log("  ✓ Vault initialized:", vaultPDA.toBase58());
    });

    it("rejects vault name > 50 chars", async () => {
      const fakeEmployer = Keypair.generate();
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: employer.publicKey,
          toPubkey: fakeEmployer.publicKey,
          lamports: 0.1e9,
        })
      );
      await provider.sendAndConfirm(tx, [employer]);
      try {
        await program.methods
          .initializeVault("A".repeat(51))
          .accounts({
            complianceOfficer: complianceOfficer.publicKey,
            employer: fakeEmployer.publicKey,
            usdcMint,
          })
          .signers([fakeEmployer])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "VaultNameTooLong");
        console.log("  ✓ Rejected long vault name");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. deposit
  // ---------------------------------------------------------------------------
  describe("deposit", () => {
    it("deposits USDC into the vault", async () => {
      const amount = uiToRaw(3000);
      await program.methods
        .deposit(amount)
        .accounts({
          vault: vaultPDA,
          vaultTokenAccount,
          employerTokenAccount,
          usdcMint,
        }as any)
        .rpc();

      const vault = await program.account.payrollVault.fetch(vaultPDA);
      assert.equal(vault.totalDeposited.toString(), amount.toString());
      console.log("  ✓ Deposited 3,000 USDC");
    });

    it("rejects zero deposit", async () => {
      try {
        await program.methods
          .deposit(new BN(0))
          .accounts({ vault: vaultPDA, vaultTokenAccount, employerTokenAccount, usdcMint } as any)
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "InvalidDisbursementAmount");
        console.log("  ✓ Rejected zero deposit");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. add_recipient
  // ---------------------------------------------------------------------------
  describe("add_recipient", () => {
    it("adds worker with KYC pending", async () => {
      await program.methods
        .addRecipient(FIVE_HUNDRED_USDC, "Acme Kenya Ltd", "John Kamau", "PayFlow Africa / KE", "M-Pesa / KE")
        .accounts({
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          workerWallet: worker1.publicKey,
          recipient: recipient1PDA
        }as any)
        .signers([complianceOfficer])
        .rpc();

      const r = await program.account.recipientAccount.fetch(recipient1PDA);
      assert.equal(r.kycVerified, false);
      assert.equal(r.isPaused, false);
      assert.equal(r.isBlacklisted, false);
      assert.equal(r.receiverName, "John Kamau");

      const vault = await program.account.payrollVault.fetch(vaultPDA);
      assert.equal(vault.recipientCount, 1);
      console.log("  ✓ Recipient added, KYC pending");
    });

    it("rejects non-compliance-officer", async () => {
      const [r2] = findRecipientPDA(vaultPDA, worker2.publicKey, program.programId);
      try {
        await program.methods
          .addRecipient(ONE_USDC, "Acme", "Jane", "PayFlow", "M-Pesa")
          .accounts({
            vault: vaultPDA,
            workerWallet: worker2.publicKey,
            recipient: r2
          }as any)
          .signers([])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "UnauthorizedComplianceOfficer");
        console.log("  ✓ Rejected unauthorized add_recipient");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. KYC gate
  // ---------------------------------------------------------------------------
  describe("kyc gate", () => {
    it("blocks disbursement before KYC", async () => {
      const [trPDA] = findTravelRulePDA(vaultPDA, recipient1PDA, 0, program.programId);
      try {
        await program.methods
          .disburse(0)
          .accounts({
            vault: vaultPDA,
            vaultTokenAccount,
            recipient: recipient1PDA,
            travelRuleRecord: trPDA,
            workerTokenAccount: worker1TokenAccount,
            usdcMint,
          }as any)
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "KycNotVerified");
        console.log("  ✓ Blocked disbursement — KYC not verified");
      }
    });

    it("compliance officer verifies KYC", async () => {
      await program.methods
        .updateKycStatus(true)
        .accounts({
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          recipient: recipient1PDA, 
        })
        .signers([complianceOfficer])
        .rpc();

      const r = await program.account.recipientAccount.fetch(recipient1PDA);
      assert.equal(r.kycVerified, true);
      console.log("  ✓ KYC verified");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. disburse
  // ---------------------------------------------------------------------------
  describe("disburse", () => {
    it("disburses USDC and writes Travel Rule PDA", async () => {
      const [trPDA] = findTravelRulePDA(vaultPDA, recipient1PDA, 0, program.programId);
      const workerBefore = await getAccount(connection, worker1TokenAccount);

      await program.methods
        .disburse(0)
        .accounts({
          vault: vaultPDA,
          vaultTokenAccount,
          recipient: recipient1PDA,
          travelRuleRecord: trPDA,
          workerTokenAccount: worker1TokenAccount,
          usdcMint,
        }as any)
        .rpc();

      const workerAfter = await getAccount(connection, worker1TokenAccount);
      const received = BigInt(workerAfter.amount.toString()) - BigInt(workerBefore.amount.toString());
      assert.equal(received.toString(), FIVE_HUNDRED_USDC.toString());

      const r = await program.account.recipientAccount.fetch(recipient1PDA);
      assert.equal(r.disbursementCount, 1);

      const tr = await program.account.travelRuleRecord.fetch(trPDA);
      assert.equal(tr.disbursementIndex, 0);
      assert.equal(tr.senderName, "Acme Kenya Ltd");
      assert.equal(tr.receiverName, "John Kamau");
      assert.equal(tr.amount.toString(), FIVE_HUNDRED_USDC.toString());
      console.log("  ✓ Disbursed 500 USDC, Travel Rule PDA written");
    });

    it("second disbursement creates new Travel Rule PDA", async () => {
      const [trPDA1] = findTravelRulePDA(vaultPDA, recipient1PDA, 1, program.programId);
      await program.methods
        .disburse(1)
        .accounts({ 
          vault: vaultPDA,
          vaultTokenAccount,
          recipient: recipient1PDA,
          travelRuleRecord: findTravelRulePDA(vaultPDA, recipient1PDA, 1, program.programId)[0],
          workerTokenAccount: worker1TokenAccount, 
          usdcMint 
        }as any)
        .signers([])
        .rpc();

      const tr = await program.account.travelRuleRecord.fetch(trPDA1);
      assert.equal(tr.disbursementIndex, 1);

      const r = await program.account.recipientAccount.fetch(recipient1PDA);
      assert.equal(r.disbursementCount, 2);
      console.log("  ✓ Second disbursement and Travel Rule record correct");
    });

    it("rejects wrong disbursement index", async () => {
      try {
        await program.methods
          .disburse(99)
          .accounts({ workerTokenAccount: worker1TokenAccount, usdcMint })
          .signers([])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.ok(err);
        console.log("  ✓ Rejected wrong disbursement index");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. AML pause
  // ---------------------------------------------------------------------------
  describe("aml pause", () => {
    it("pauses recipient and blocks disbursement", async () => {
      await program.methods
        .setRecipientPause(true)
        .accounts({ 
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          recipient: recipient1PDA,
        })
        .signers([complianceOfficer])
        .rpc();

      try {
        await program.methods
          .disburse(2)
          .accounts({ 
            complianceOfficer: complianceOfficer.publicKey,
            vault: vaultPDA,
            recipient: recipient1PDA,
            workerTokenAccount: worker1TokenAccount, usdcMint 
          } as any)
          .signers([])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "RecipientPaused");
        console.log("  ✓ Blocked disbursement — AML hold");
      }
    });

    it("unpauses and allows disbursement", async () => {
      await program.methods
        .setRecipientPause(false)
        .accounts({
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          recipient: recipient1PDA
        })
        .signers([complianceOfficer])
        .rpc();

      const r = await program.account.recipientAccount.fetch(recipient1PDA);
      assert.equal(r.isPaused, false);
      console.log("  ✓ Recipient unpaused");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Blacklist
  // ---------------------------------------------------------------------------
  describe("blacklist", () => {
    it("blacklists and blocks all operations", async () => {
      await program.methods
        .blacklistRecipient()
        .accounts({
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          recipient: recipient1PDA, 
        })
        .signers([complianceOfficer])
        .rpc();

      const r = await program.account.recipientAccount.fetch(recipient1PDA);
      assert.equal(r.isBlacklisted, true);
      assert.equal(r.isPaused, true);
      console.log("  ✓ Recipient blacklisted");
    });

    it("blocks disbursement", async () => {
      try {
        await program.methods
          .disburse(2)
          .accounts({
            vault: vaultPDA,
            recipient: recipient1PDA, 
            workerTokenAccount: worker1TokenAccount, 
            usdcMint 
          }as any)
          .signers([])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "RecipientBlacklisted");
        console.log("  ✓ Blocked disbursement — blacklisted");
      }
    });

    it("blocks KYC update", async () => {
      try {
        await program.methods
          .updateKycStatus(true)
          .accounts({
            complianceOfficer: complianceOfficer.publicKey,
            vault: vaultPDA,
            recipient: recipient1PDA
          })
          .signers([complianceOfficer])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "AlreadyBlacklisted");
        console.log("  ✓ Blocked KYC update on blacklisted recipient");
      }
    });

    it("blocks re-blacklisting", async () => {
      try {
        await program.methods
          .blacklistRecipient()
          .accounts({
            complianceOfficer: complianceOfficer.publicKey,
            vault: vaultPDA,
            recipient: recipient1PDA, 
          })
          .signers([complianceOfficer])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "AlreadyBlacklisted");
        console.log("  ✓ Blocked double-blacklist");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 8. remove_recipient
  // ---------------------------------------------------------------------------
  describe("remove_recipient", () => {
    it("closes PDA, returns rent, decrements count", async () => {
      const balanceBefore = await connection.getBalance(complianceOfficer.publicKey);

      await program.methods
        .removeRecipient()
        .accounts({
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          recipient: recipient1PDA, 
        })
        .signers([complianceOfficer])
        .rpc();

      try {
        await program.account.recipientAccount.fetch(recipient1PDA);
        assert.fail("Account should be closed");
      } catch (_) {}

      const vault = await program.account.payrollVault.fetch(vaultPDA);
      assert.equal(vault.recipientCount, 0);

      const balanceAfter = await connection.getBalance(complianceOfficer.publicKey);
      assert.isAbove(balanceAfter, balanceBefore - 10_000);
      console.log("  ✓ PDA closed, rent returned, count decremented");
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Insufficient vault balance
  // ---------------------------------------------------------------------------
  describe("insufficient vault balance", () => {
    let bigWorker: Keypair;
    let bigWorkerTA: PublicKey;
    let bigRecipientPDA: PublicKey;

    before(async () => {
      bigWorker = Keypair.generate();
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: employer.publicKey,
          toPubkey: bigWorker.publicKey,
          lamports: 0.1e9,
        })
      );
      await provider.sendAndConfirm(tx, [employer]);
      bigWorkerTA = await createAssociatedTokenAccount(connection, bigWorker, usdcMint, bigWorker.publicKey);
      [bigRecipientPDA] = findRecipientPDA(vaultPDA, bigWorker.publicKey, program.programId);

      await program.methods
        .addRecipient(uiToRaw(999_999), "Acme", "BigWorker", "PayFlow", "M-Pesa")
        .accounts({ 
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA, 
          workerWallet: bigWorker.publicKey, 
          recipient: bigRecipientPDA 
        }as any)
        .signers([complianceOfficer])
        .rpc();

      await program.methods
        .updateKycStatus(true)
        .accounts({ 
          complianceOfficer: complianceOfficer.publicKey,
          vault: vaultPDA,
          recipient: bigRecipientPDA
        })
        .signers([complianceOfficer])
        .rpc();
    });

    it("rejects when vault balance is too low", async () => {
      const [trPDA] = findTravelRulePDA(vaultPDA, bigRecipientPDA, 0, program.programId);
      try {
        await program.methods
          .disburse(0)
          .accounts({ vault: vaultPDA, vaultTokenAccount, recipient: bigRecipientPDA, travelRuleRecord: trPDA, workerTokenAccount: bigWorkerTA, usdcMint }as any)
          .signers([])
          .rpc();
        assert.fail();
      } catch (err: any) {
        assert.include(err.toString(), "InsufficientVaultBalance");
        console.log("  ✓ Rejected — insufficient vault balance");
      }
    });
  });
});