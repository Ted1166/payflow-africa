import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';
import { findVaultPDA, rawToUi, uiToRaw, shortKey, kycLabel, PROGRAM_ID } from '../utils/program';
import { useProgram } from '../hooks/useProgram';
import Toast from './Toast';

const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

interface VaultAccount { employer: PublicKey; complianceOfficer: PublicKey; vaultName: string; totalDeposited: BN; totalDisbursed: BN; recipientCount: number; bump: number; }
interface RecipientAccount { pda: PublicKey; workerWallet: PublicKey; senderName: string; receiverName: string; senderVasp: string; receiverVasp: string; amountPerDisbursement: BN; kycVerified: boolean; isPaused: boolean; isBlacklisted: boolean; totalReceived: BN; disbursementCount: number; }
type ToastState = { message: string; type: 'success' | 'error' } | null;
type Panel = 'deposit' | 'addWorker' | null;

function parseError(e: unknown): string {
  if (e instanceof Error) {
    const match = e.message.match(/Error Message: (.+?)(\.|$)/);
    if (match) return match[1];
    return e.message.length < 120 ? e.message : e.message.slice(0, 120) + '…';
  }
  return 'Unknown error';
}

export default function EmployerDashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const prog = useProgram();

  const [vault, setVault] = useState<VaultAccount | null>(null);
  const [recipients, setRecipients] = useState<RecipientAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [vaultName, setVaultName] = useState('');
  const [coAddress, setCoAddress] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [newR, setNewR] = useState({ workerWallet: '', amount: '', senderName: '', receiverName: '', senderVasp: 'PayFlow Africa / KE', receiverVasp: 'M-Pesa / KE' });

  const notify = (msg: string, type: 'success' | 'error' = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 5000); };

  const refreshing = useRef(false);

  const progRef = useRef(prog);
  progRef.current = prog;

  const refresh = useCallback(async () => {
    if (!wallet.publicKey || refreshing.current) return;
    refreshing.current = true;
    try {
      const p = progRef.current;
      const [vaultPDA] = findVaultPDA(wallet.publicKey);
      const v = await p.fetchVault(vaultPDA);
      setVault(v ? v as unknown as VaultAccount : null);
      if (!v) { setRecipients([]); return; }

      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 8, bytes: vaultPDA.toBase58() } },
        ],
      });

      const parsed: RecipientAccount[] = allAccounts.flatMap(({ pubkey, account }) => {
        try {
          const d = account.data;
          if (d.length < 100) return [];
          let o = 8;
          o += 32; // vault pubkey
          const workerWallet = new PublicKey(d.slice(o, o + 32)); o += 32;
          const amountPerDisbursement = new BN(d.slice(o, o + 8), 'le'); o += 8;
          const kycVerified = d[o] === 1; o += 1;
          const isPaused = d[o] === 1; o += 1;
          const isBlacklisted = d[o] === 1; o += 1;
          const totalReceived = new BN(d.slice(o, o + 8), 'le'); o += 8;
          const disbursementCount = d.readUInt32LE(o); o += 4;
          o += 8; // lastDisbursedAt
          const snLen = d.readUInt32LE(o); o += 4;
          const senderName = d.slice(o, o + snLen).toString('utf8'); o += snLen;
          const rnLen = d.readUInt32LE(o); o += 4;
          const receiverName = d.slice(o, o + rnLen).toString('utf8'); o += rnLen;
          const svLen = d.readUInt32LE(o); o += 4;
          const senderVasp = d.slice(o, o + svLen).toString('utf8'); o += svLen;
          const rvLen = d.readUInt32LE(o); o += 4;
          const receiverVasp = d.slice(o, o + rvLen).toString('utf8'); o += rvLen;
          return [{ pda: pubkey, workerWallet, senderName, receiverName, senderVasp, receiverVasp, amountPerDisbursement, kycVerified, isPaused, isBlacklisted, totalReceived, disbursementCount }];
        } catch { return []; }
      });

      setRecipients(parsed);
    } catch (e) {
      console.error('refresh error:', e);
    } finally {
      refreshing.current = false;
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!wallet.publicKey) return null;
  const [vaultPDA] = findVaultPDA(wallet.publicKey);
  const vaultBalance = vault ? Math.max(0, parseFloat(rawToUi(vault.totalDeposited)) - parseFloat(rawToUi(vault.totalDisbursed))) : 0;

  const handleInitVault = async () => {
    setLoading(true);
    try {
      let co: PublicKey;
      try { co = new PublicKey(coAddress.trim()); } catch { notify('Invalid compliance officer address', 'error'); return; }
      const { tx } = await prog.initializeVault(vaultName, co, DEVNET_USDC_MINT);
      notify(`Vault created ✓  ${tx.slice(0, 12)}…`);
      await refresh();
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoading(false); }
  };

  const handleDeposit = async () => {
    setLoadingAction('deposit');
    try {
      const ata = await getAssociatedTokenAddress(DEVNET_USDC_MINT, wallet.publicKey!);
      const { tx } = await prog.deposit(vaultPDA, DEVNET_USDC_MINT, ata, uiToRaw(depositAmount));
      notify(`Deposited ${depositAmount} USDC ✓  ${tx.slice(0, 12)}…`);
      setDepositAmount(''); setActivePanel(null); await refresh();
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoadingAction(null); }
  };

  const handleAddRecipient = async () => {
    setLoadingAction('addWorker');
    try {
      let wk: PublicKey;
      try { wk = new PublicKey(newR.workerWallet.trim()); } catch { notify('Invalid worker wallet', 'error'); return; }
      const amt = uiToRaw(newR.amount);
      const { tx, recipientPDA } = await prog.addRecipient(vaultPDA, wk, amt, newR.senderName, newR.receiverName, newR.senderVasp, newR.receiverVasp);
      notify(`Worker added, KYC pending ✓  ${tx.slice(0, 12)}…`);
      setRecipients(p => [...p, { pda: recipientPDA, workerWallet: wk, senderName: newR.senderName, receiverName: newR.receiverName, senderVasp: newR.senderVasp, receiverVasp: newR.receiverVasp, amountPerDisbursement: amt, kycVerified: false, isPaused: false, isBlacklisted: false, totalReceived: new BN(0), disbursementCount: 0 }]);
      setNewR({ workerWallet: '', amount: '', senderName: '', receiverName: '', senderVasp: 'PayFlow Africa / KE', receiverVasp: 'M-Pesa / KE' });
      setActivePanel(null); await refresh();
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoadingAction(null); }
  };

  const handleKyc = async (r: RecipientAccount) => {
    const k = `kyc-${r.pda}`; setLoadingAction(k);
    try {
      await prog.updateKycStatus(vaultPDA, r.pda, !r.kycVerified);
      notify(`KYC ${!r.kycVerified ? 'verified' : 'revoked'} for ${r.receiverName} ✓`);
      setRecipients(p => p.map(x => x.pda.equals(r.pda) ? { ...x, kycVerified: !x.kycVerified } : x));
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoadingAction(null); }
  };

  const handleDisburse = async (r: RecipientAccount) => {
    const k = `disburse-${r.pda}`; setLoadingAction(k);
    try {
      const { tx, travelRulePDA } = await prog.disburse(vaultPDA, r.pda, r.workerWallet, DEVNET_USDC_MINT, r.disbursementCount);
      notify(`Disbursed ${rawToUi(r.amountPerDisbursement)} USDC to ${r.receiverName} ✓`);
      console.log('[Travel Rule PDA]', travelRulePDA.toString(), '| tx:', tx);
      setRecipients(p => p.map(x => x.pda.equals(r.pda) ? { ...x, disbursementCount: x.disbursementCount + 1, totalReceived: x.totalReceived.add(x.amountPerDisbursement) } : x));
      await refresh();
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoadingAction(null); }
  };

  const handlePause = async (r: RecipientAccount) => {
    const k = `pause-${r.pda}`; setLoadingAction(k);
    try {
      await prog.setRecipientPause(vaultPDA, r.pda, !r.isPaused);
      notify(`${!r.isPaused ? 'AML hold placed' : 'Hold removed'} for ${r.receiverName} ✓`);
      setRecipients(p => p.map(x => x.pda.equals(r.pda) ? { ...x, isPaused: !x.isPaused } : x));
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoadingAction(null); }
  };

  const handleBlacklist = async (r: RecipientAccount) => {
    const k = `bl-${r.pda}`; setLoadingAction(k);
    try {
      await prog.blacklistRecipient(vaultPDA, r.pda);
      notify(`${r.receiverName} permanently blacklisted ✓`);
      setRecipients(p => p.map(x => x.pda.equals(r.pda) ? { ...x, isBlacklisted: true, isPaused: true } : x));
    } catch (e) { notify(parseError(e), 'error'); } finally { setLoadingAction(null); }
  };

  return (
    <div className="employer-dash">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {!vault ? (
        <div className="init-section">
          <div className="init-card card">
            <div className="card-title">Initialize Payroll Vault</div>
            <p className="init-desc">Create your on-chain payroll vault. Workers can only be paid after KYC verification. Every disbursement writes an immutable Travel Rule record on-chain.</p>
            <div className="init-form">
              <div className="field"><label>Vault Name (max 50 chars)</label><input placeholder="Acme Kenya Payroll" value={vaultName} onChange={e => setVaultName(e.target.value)} maxLength={50} /></div>
              <div className="field"><label>Compliance Officer Wallet</label><input className="mono" placeholder="Solana public key" value={coAddress} onChange={e => setCoAddress(e.target.value)} /></div>
              <div className="field"><label>USDC Mint (Devnet)</label><input className="mono" value={DEVNET_USDC_MINT.toString()} readOnly style={{ opacity: 0.5 }} /></div>
              <button className="btn btn-primary" disabled={loading || !vaultName || !coAddress} onClick={handleInitVault}>
                {loading ? <span className="spinner" /> : null} Initialize Vault
              </button>
            </div>
            <div className="demo-note"><span>◈</span><div><strong>Devnet mode.</strong> Program: <span className="mono">{PROGRAM_ID.toString().slice(0, 16)}…</span></div></div>
          </div>
        </div>
      ) : (
        <>
          <div className="stats-row grid-4">
            {[
              { title: 'Available Balance', value: `$${vaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, label: 'USDC' },
              { title: 'Total Deposited', value: rawToUi(vault.totalDeposited), label: 'USDC' },
              { title: 'Total Disbursed', value: rawToUi(vault.totalDisbursed), label: 'USDC' },
              { title: 'Workers', value: String(vault.recipientCount), label: 'Recipients' },
            ].map(s => (
              <div key={s.title} className="stat-card card">
                <div className="card-title">{s.title}</div>
                <div className="stat-value mono">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="vault-meta card" style={{ marginTop: 16 }}>
            <div className="vault-meta-inner">
              <div>
                <div className="card-title">Vault</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{vault.vaultName}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{shortKey(vaultPDA)}</div>
              </div>
              <div><div className="card-title">Compliance Officer</div><div className="mono" style={{ fontSize: 13 }}>{shortKey(vault.complianceOfficer)}</div></div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setActivePanel(activePanel === 'deposit' ? null : 'deposit')}>+ Deposit</button>
                <button className="btn btn-primary btn-sm" onClick={() => setActivePanel(activePanel === 'addWorker' ? null : 'addWorker')}>+ Add Worker</button>
              </div>
            </div>

            {activePanel === 'deposit' && (
              <div className="action-panel"><div className="divider" /><div className="panel-title">Deposit USDC into Vault</div>
                <div className="panel-row">
                  <div className="field" style={{ flex: 1 }}><label>Amount (USDC)</label><input type="number" placeholder="1000" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></div>
                  <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={loadingAction === 'deposit' || !depositAmount} onClick={handleDeposit}>
                    {loadingAction === 'deposit' ? <span className="spinner" /> : null} Deposit
                  </button>
                </div>
              </div>
            )}

            {activePanel === 'addWorker' && (
              <div className="action-panel"><div className="divider" /><div className="panel-title">Add Worker — Travel Rule Data Required</div>
                <div className="grid-2" style={{ gap: 12 }}>
                  <div className="field"><label>Worker Wallet</label><input className="mono" placeholder="Solana public key" value={newR.workerWallet} onChange={e => setNewR(p => ({ ...p, workerWallet: e.target.value }))} /></div>
                  <div className="field"><label>Amount / Disbursement (USDC)</label><input type="number" placeholder="500" value={newR.amount} onChange={e => setNewR(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div className="field"><label>Sender Name</label><input placeholder="Acme Kenya Ltd" value={newR.senderName} onChange={e => setNewR(p => ({ ...p, senderName: e.target.value }))} /></div>
                  <div className="field"><label>Receiver Name</label><input placeholder="John Kamau" value={newR.receiverName} onChange={e => setNewR(p => ({ ...p, receiverName: e.target.value }))} /></div>
                  <div className="field"><label>Sender VASP</label><input placeholder="PayFlow Africa / KE" value={newR.senderVasp} onChange={e => setNewR(p => ({ ...p, senderVasp: e.target.value }))} /></div>
                  <div className="field"><label>Receiver VASP</label><input placeholder="M-Pesa / KE" value={newR.receiverVasp} onChange={e => setNewR(p => ({ ...p, receiverVasp: e.target.value }))} /></div>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={loadingAction === 'addWorker' || !newR.workerWallet || !newR.amount || !newR.senderName || !newR.receiverName} onClick={handleAddRecipient}>
                  {loadingAction === 'addWorker' ? <span className="spinner" /> : null} Add Worker
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header">
              <div><div className="section-title">Workers</div><div className="section-sub">KYC · AML · Disbursement history</div></div>
            </div>
            {recipients.length === 0 ? (
              <div className="empty card"><div className="empty-icon">◈</div><p>No workers added yet.</p></div>
            ) : (
              <div className="recipients-table card">
                <table>
                  <thead><tr><th>Worker</th><th>Amount / Period</th><th>Status</th><th>Disbursements</th><th>Total Received</th><th>Actions</th></tr></thead>
                  <tbody>
                    {recipients.map(r => {
                      const s = kycLabel(r.kycVerified, r.isPaused, r.isBlacklisted);
                      const k = r.pda.toString();
                      return (
                        <tr key={k}>
                          <td><div className="mono" style={{ fontSize: 12 }}>{shortKey(r.workerWallet)}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.receiverName}</div></td>
                          <td><span className="mono">{rawToUi(r.amountPerDisbursement)}</span> USDC</td>
                          <td><span className="badge" style={{ color: s.color, background: s.bg }}>{s.label}</span></td>
                          <td className="mono">{r.disbursementCount}</td>
                          <td className="mono">{rawToUi(r.totalReceived)} USDC</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {!r.isBlacklisted && (
                                <button className="btn btn-ghost btn-sm" disabled={loadingAction === `kyc-${k}`} onClick={() => handleKyc(r)}>
                                  {loadingAction === `kyc-${k}` ? <span className="spinner" /> : null}
                                  {r.kycVerified ? 'Revoke KYC' : 'Verify KYC'}
                                </button>
                              )}
                              {r.kycVerified && !r.isBlacklisted && (
                                <button className="btn btn-primary btn-sm" disabled={loadingAction === `disburse-${k}`} onClick={() => handleDisburse(r)}>
                                  {loadingAction === `disburse-${k}` ? <span className="spinner" /> : null} Disburse
                                </button>
                              )}
                              {!r.isBlacklisted && (
                                <button className="btn btn-ghost btn-sm" disabled={loadingAction === `pause-${k}`} onClick={() => handlePause(r)}>
                                  {r.isPaused ? 'Unpause' : 'AML Hold'}
                                </button>
                              )}
                              {!r.isBlacklisted && (
                                <button className="btn btn-danger btn-sm" disabled={loadingAction === `bl-${k}`} onClick={() => handleBlacklist(r)}>Blacklist</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="travel-rule-note card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className="card-title">Travel Rule Compliance</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 500 }}>
                  Every disbursement writes an immutable <strong>TravelRuleRecord PDA</strong> — sender, receiver, VASP identifiers, amount, timestamp. Permanently auditable on-chain.
                </p>
              </div>
              <div className="tr-example mono">
                {[['Seeds', '[travel_rule · vault · recipient · index]'], ['Program', PROGRAM_ID.toString().slice(0, 20) + '…'], ['Network', 'Solana Devnet']].map(([k, v]) => (
                  <div key={k} className="tr-row"><span style={{ color: 'var(--text-muted)' }}>{k}</span><span>{v}</span></div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
