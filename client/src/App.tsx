import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import EmployerDashboard from './components/EmployerDashboard';
import WorkerView from './components/WorkView';
import './App.css';
import './components/components.css';

type Tab = 'employer' | 'worker';

export default function App() {
  const { connected, publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>('employer');

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="6" fill="var(--gold)" fillOpacity="0.12"/>
                <path d="M7 14h14M14 7v14M9 9l10 10M19 9L9 19" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="brand-name">PayFlow <span>Africa</span></div>
              <div className="brand-sub">Compliant Payroll on Solana</div>
            </div>
          </div>

          <nav className="tab-nav">
            <button className={`tab-btn ${tab === 'employer' ? 'active' : ''}`} onClick={() => setTab('employer')}>
              Employer
            </button>
            <button className={`tab-btn ${tab === 'worker' ? 'active' : ''}`} onClick={() => setTab('worker')}>
              Worker
            </button>
          </nav>

          <div className="wallet-area">
            {connected && publicKey && (
              <div className="wallet-badge mono">
                {publicKey.toString().slice(0,4)}…{publicKey.toString().slice(-4)}
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>

        <div className="compliance-strip">
          {['KYC', 'KYT', 'AML', 'Travel Rule', 'Devnet'].map((item, i) => (
            <span key={item}>{i > 0 && <span className="strip-sep"> · </span>}{item}</span>
          ))}
        </div>
      </header>

      <main className="main">
        {!connected ? (
          <div className="connect-prompt">
            <div className="connect-glyph">◈</div>
            <h2>Connect your wallet</h2>
            <p>Use Phantom or Solflare on Devnet to get started</p>
            <WalletMultiButton />
          </div>
        ) : (
          <div className="content">
            {tab === 'employer' ? <EmployerDashboard /> : <WorkerView />}
          </div>
        )}
      </main>

      <footer className="footer">
        <span className="mono">PayFlow Africa</span>
        <span> · Built on Solana · StableHacks 2026</span>
      </footer>
    </div>
  );
}
