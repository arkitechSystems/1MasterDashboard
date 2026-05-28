// Connect to Bank button — opens Plaid Link, exchanges the public_token via
// the server, then triggers a sync and pushes the resulting transactions
// into the Bank table.
//
// Gated on REACT_APP_API_URL being set. In static-mode builds (no API URL)
// this renders as an inert placeholder that just logs.
//
// react-plaid-link is loaded via require() so the build doesn't fail before
// `npm install react-plaid-link` runs. Once installed, the hook works
// normally.

import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchLinkToken,
  exchangePublicToken,
  syncPlaidItem,
  fetchBankTransactions,
  fetchPlaidStatus,
} from '../../services/plaidClient';
import { BankRow } from './data';

interface Props {
  setBankData: React.Dispatch<React.SetStateAction<BankRow[]>>;
}

const API_AVAILABLE = !!process.env.REACT_APP_API_URL;

type LinkSuccess = (publicToken: string, metadata: unknown) => void;

const ConnectToBankButton: React.FC<Props> = ({ setBankData }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (!API_AVAILABLE) {
      console.log('Connect to bank — not available in static demo (no REACT_APP_API_URL)');
      return;
    }
    setBusy(true);
    setStatus('Preparing link…');
    try {
      // Check whether the server has real Plaid creds. If not, do a direct
      // mock exchange — Plaid Link itself would reject a mock link_token.
      const plaidStatus = await fetchPlaidStatus();
      if (!plaidStatus.configured) {
        setStatus('Linking demo bank…');
        const { id, institution_name } = await exchangePublicToken('public-mock-token');
        setStatus(`Connected to ${institution_name || 'demo bank'}. Syncing…`);
        const result = await syncPlaidItem(id);
        const txns = await fetchBankTransactions(0, 999999);
        setBankData(txns);
        setStatus(`Demo: synced ${result.added} added, ${result.modified} updated.`);
        setBusy(false);
        return;
      }
      const { link_token } = await fetchLinkToken();
      setLinkToken(link_token); // Mounts <PlaidLinkOpener>, which auto-opens
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${(e as Error).message}`);
      setBusy(false);
    }
  }, [setBankData]);

  const handleSuccess = useCallback<LinkSuccess>(
    async (publicToken) => {
      try {
        setStatus('Linking…');
        const { id, institution_name } = await exchangePublicToken(publicToken);
        setStatus(`Connected to ${institution_name || 'bank'}. Syncing transactions…`);
        const result = await syncPlaidItem(id);
        const txns = await fetchBankTransactions(0, 999999);
        setBankData(txns);
        setStatus(`Synced ${result.added} new, ${result.modified} updated.`);
      } catch (e) {
        console.error(e);
        setStatus(`Error: ${(e as Error).message}`);
      } finally {
        setLinkToken(null);
        setBusy(false);
      }
    },
    [setBankData],
  );

  const handleExit = useCallback(() => {
    setLinkToken(null);
    setBusy(false);
    setStatus(null);
  }, []);

  return (
    <>
      <button
        type="button"
        className="btn ai"
        onClick={handleClick}
        disabled={busy}
        style={{ opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
        title={API_AVAILABLE ? 'Connect via Plaid' : 'Not available in static demo'}
      >
        <span className="material-icons" aria-hidden="true">link</span>
        <span>Connect to bank</span>
        <span className="ai-shimmer" />
      </button>
      {status && (
        <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginLeft: '4px' }}>
          {status}
        </span>
      )}
      {linkToken && (
        <PlaidLinkOpener token={linkToken} onSuccess={handleSuccess} onExit={handleExit} />
      )}
    </>
  );
};

// Mounted only when we have a link token. Uses the react-plaid-link hook
// top-level (no conditional hook calls inside its own body) and auto-opens
// once ready.
const PlaidLinkOpener: React.FC<{
  token: string;
  onSuccess: LinkSuccess;
  onExit: () => void;
}> = ({ token, onSuccess, onExit }) => {
  // Lazy require so absent package doesn't break the build before install.
  let usePlaidLink: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    usePlaidLink = require('react-plaid-link').usePlaidLink;
  } catch {
    // Component mounted but package missing — surface the error to console
    // and unmount via onExit.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      console.warn('react-plaid-link is not installed. Run: npm install react-plaid-link');
      onExit();
    }, [onExit]);
    return null;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
};

export default ConnectToBankButton;
