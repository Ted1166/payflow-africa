import './polyfills';
// import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import WalletContextProvider from './WalletProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
);