import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { kycLabel, findVaultPDA, findRecipientPDA } from '../utils/program';
import { useProgram } from '../hooks/useProgram';
import Toast from './Toast';
import QRCode from './QrCode';
import BN from 'bn.js';

type ToastState = { message: string; type: 'success' | 'error' } | null;

interface TravelRuleEntry {
  index: number;
  amount: BN;
  timestamp: number;
  senderName: string;
  senderVasp: string;
  receiverName: string;
  receiverVasp: string;
  pda: string;
}

export default function WorkerView() {
  const { publicKey } = useWallet();
  const prog = useProgram();

  const [employerInput, setEmployerInput] = useState('');
  const [resolvedVault, setResolvedVault] = useState<string | null>(null);
  const [recipientInfo, setRecipientInfo] = useState<{
    kycVerified: boolean; isPaused: boolean; isBlacklisted: boolean;
    disbursementCount: number; receiverName: string;
  } | null>(null);
  const [history, setHistory] = useState<TravelRuleEntry[]>([]);
  const [resolving, setResolving] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ message: msg, type }); setTimeout(() => setToast(null), 5000);
  };

  const handleResolve = useCallback(async () => {
    if (!publicKey) return;
    setResolving(true);
    try {
      const employerPK = new PublicKey(employerInput.trim());
      const [vaultPDA] = findVaultPDA(employerPK);

      // Check vault exists
      const vault = await prog.fetchVault(vaultPDA);
      if (!vault) { notify('No vault found for this employer', 'error'); return; }

      setResolvedVault(vaultPDA.toString());

      // Fetch recipient account
      const [recipientPDA] = findRecipientPDA(vaultPDA, publicKey);
      const recipient = await prog.fetchRecipient(recipientPDA);

      if (!recipient) {
        notify('You are not registered as a worker in this vault', 'error');
        setRecipientInfo(null); setHistory([]); return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = recipient as any;
      setRecipientInfo({
        kycVerified: r.kycVerified,
        isPaused: r.isPaused,
        isBlacklisted: r.isBlacklisted,
        disbursementCount: r.disbursementCount,
        receiverName: r.receiverName,
      });
      notify(`Found — ${r.disbursementCount} disbursement(s) on record`);

      // Fetch travel rule records
      const entries: TravelRuleEntry[] = [];
      for (let i = 0; i < r.disbursementCount; i++) {
        try {
          const { findTravelRulePDA: ftr } = await import('../utils/program');
          const [trPDA] = ftr(vaultPDA, recipientPDA, i);
          const tr = await prog.fetchTravelRule(trPDA);
          if (!tr) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const t = tr as any;
          entries.push({
            index: i,
            amount: t.amount,
            timestamp: t.timestamp,
            senderName: t.senderName,
            senderVasp: t.senderVasp,
            receiverName: t.receiverName,
            receiverVasp: t.receiverVasp,
            pda: trPDA.toString(),
          });
        } catch { /* no record for this index */ }
      }
      setHistory(entries.reverse()); // newest first
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Invalid employer address', 'error');
    } finally {
      setResolving(false);
    }
  }, [publicKey, employerInput, prog]);

  const blinkUrl = publicKey
    ? `https://payflow-africa.app/api/actions/pay/${publicKey.toString()}`
    : null;

  if (!publicKey) return null;

  const status = recipientInfo
    ? kycLabel(recipientInfo.kycVerified, recipientInfo.isPaused, recipientInfo.isBlacklisted)
    : null;

  const formatTs = (ts: number) => new Date(ts * 1000).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="worker-view">
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="section-header">
        <div>
          <div className="section-title">Worker Portal</div>
          <div className="section-sub">Your payroll status, Blink payment link, and disbursement history</div>
        </div>
      </div>

      {/* ── Wallet ── */}
      <div className="grid-2" style={{ gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Your Wallet</div>
          <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {publicKey.toString()}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Compliance Status</div>
          {status ? (
            <>
              <span className="badge" style={{ color: status.color, background: status.bg, fontSize: 13, padding: '6px 14px' }}>
                {status.label}
              </span>
              {recipientInfo && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                  {recipientInfo.disbursementCount} disbursement{recipientInfo.disbursementCount !== 1 ? 's' : ''} received
                  {recipientInfo.receiverName ? ` · ${recipientInfo.receiverName}` : ''}
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Resolve a vault below to see your compliance status.
            </p>
          )}
        </div>
      </div>

      {/* ── Blink ── */}
      <div className="blink-card card" style={{ marginBottom: 24 }}>
        <div className="blink-header">
          <div>
            <div className="card-title">Payroll Blink</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              Share this link or QR code with your employer to trigger an on-chain disbursement.
              KYC is verified on-chain and a Travel Rule record is written automatically.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowQR(!showQR)}>
            {showQR ? 'Hide QR' : 'Show QR'}
          </button>
        </div>

        {blinkUrl && (
          <div className="blink-url" onClick={() => { navigator.clipboard.writeText(blinkUrl); notify('Blink URL copied!'); }}>
            <span className="blink-label">BLINK</span>
            <span className="blink-link">{blinkUrl}</span>
            <span className="blink-copy">Copy</span>
          </div>
        )}

        {showQR && blinkUrl && (
          <div className="qr-wrapper">
            <QRCode value={blinkUrl} size={180} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
              Scan to trigger payment · KYC verified on-chain · Travel Rule compliant
            </p>
          </div>
        )}

        <div className="blink-flow">
          {['Employer loads vault', 'Worker shares Blink', 'KYC checked on-chain', 'USDC disbursed', 'Travel Rule PDA written'].map((step, i, arr) => (
            <div key={step} className="blink-step">
              <div className="step-num">{i + 1}</div>
              <div className="step-label">{step}</div>
              {i < arr.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Vault lookup ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Look Up Your Payroll Vault</div>
        <div className="panel-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Employer Wallet Address</label>
            <input className="mono" placeholder="Employer's Solana public key"
              value={employerInput} onChange={e => setEmployerInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleResolve()} />
          </div>
          <button className="btn btn-ghost" style={{ alignSelf: 'flex-end' }}
            disabled={!employerInput || resolving} onClick={handleResolve}>
            {resolving ? <span className="spinner" /> : null} Resolve
          </button>
        </div>
        {resolvedVault && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-dim)', borderRadius: 'var(--radius)', border: '1px solid rgba(76,175,130,0.2)' }}>
            <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Vault PDA</div>
            <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{resolvedVault}</div>
          </div>
        )}
      </div>

      {/* ── History ── */}
      <div>
        <div className="section-header">
          <div className="section-title" style={{ fontSize: 16 }}>Disbursement History</div>
          {history.length > 0 && (
            <span className="badge" style={{ color: 'var(--green)', background: 'var(--green-dim)' }}>
              {history.length} payment{history.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {history.length === 0 ? (
          <div className="empty card">
            <div className="empty-icon">◈</div>
            <p>Resolve a vault above to load your payment history.</p>
          </div>
        ) : (
          <div className="history-list">
            {history.map(item => (
              <div key={item.index} className="history-item card">
                <div className="history-main">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Disbursement #{item.index}
                    </div>
                    <div className="stat-value" style={{ fontSize: 24 }}>
                      ${(item.amount.toNumber() / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {formatTs(item.timestamp)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge" style={{ color: 'var(--green)', background: 'var(--green-dim)', display: 'inline-flex', marginBottom: 8 }}>
                      Completed
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.senderName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.senderVasp} → {item.receiverVasp}</div>
                  </div>
                </div>
                <div className="history-travel-rule">
                  <span style={{ fontSize: 10, color: 'var(--gold-dim)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>◈ Travel Rule PDA</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{item.pda}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
