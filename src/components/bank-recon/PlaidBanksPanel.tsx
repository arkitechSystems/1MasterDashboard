/**
 * Connected Banks panel. Shows every Plaid item linked to this tenant with
 * status badge, last-sync timestamp, and Sync / Disconnect actions. Polls
 * the /api/plaid/status endpoint on mount so it can detect when the server
 * is running without PLAID_CLIENT_ID and put up a friendly demo banner
 * instead of failing silently.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchPlaidStatus,
  listPlaidItems,
  syncPlaidItem,
  disconnectPlaidItem,
  fetchBankTransactions,
  PlaidItem,
  PlaidStatus,
} from '../../services/plaidClient';
import { BankRow } from './data';

interface Props {
  setBankData: React.Dispatch<React.SetStateAction<BankRow[]>>;
}

const API_AVAILABLE = !!process.env.REACT_APP_API_URL;

const fmtRelative = (epochSeconds: number | null): string => {
  if (!epochSeconds) return 'never';
  const ms = Date.now() - epochSeconds * 1000;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h ago`;
  return `${Math.round(ms / 86_400_000)} d ago`;
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#e8f8f4', fg: '#16a085' },
  login_required: { bg: '#fff4e8', fg: '#b45309' },
  error: { bg: '#fdecea', fg: '#b71c1c' },
};

const PlaidBanksPanel: React.FC<Props> = ({ setBankData }) => {
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [items, setItems] = useState<PlaidItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!API_AVAILABLE) return;
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([fetchPlaidStatus(), listPlaidItems()]);
      setStatus(s);
      setItems(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Plaid items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSync = async (id: number) => {
    setPendingId(id);
    setError(null);
    setInfo(null);
    try {
      const result = await syncPlaidItem(id);
      const txns = await fetchBankTransactions(0, 999999);
      setBankData(txns);
      setInfo(
        `Synced item #${id}: ${result.added} added, ${result.modified} updated, ${result.removed} removed.`,
      );
      await reload();
    } catch (e: any) {
      setError(`Sync failed: ${e?.message || 'unknown error'}`);
    } finally {
      setPendingId(null);
    }
  };

  const handleDisconnect = async (id: number) => {
    if (!window.confirm(`Disconnect bank item #${id}? Transactions will stay; only the live link is removed.`)) {
      return;
    }
    setPendingId(id);
    setError(null);
    setInfo(null);
    try {
      await disconnectPlaidItem(id);
      setInfo(`Disconnected item #${id}.`);
      await reload();
    } catch (e: any) {
      setError(`Disconnect failed: ${e?.message || 'unknown error'}`);
    } finally {
      setPendingId(null);
    }
  };

  if (!API_AVAILABLE) {
    return (
      <div style={panelStyle}>
        <div style={headStyle}>Connected Banks</div>
        <div style={{ padding: 14, fontSize: 13, color: '#6c7a87' }}>
          Bank connections are unavailable in static-demo builds (set{' '}
          <code>REACT_APP_API_URL</code> and deploy the Express backend to enable Plaid).
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={headStyle}>
        <span>Connected Banks</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 4,
                background: status.configured ? '#e8f8f4' : '#fff4e8',
                color: status.configured ? '#16a085' : '#b45309',
                border: status.configured ? '1px solid #bce8dc' : '1px solid #f3d3ab',
              }}
              title={
                status.configured
                  ? `Plaid env: ${status.env}`
                  : 'PLAID_CLIENT_ID / PLAID_SECRET not set — running in mock mode'
              }
            >
              {status.configured ? `Plaid · ${status.env}` : 'Mock mode'}
            </span>
          )}
          <button type="button" onClick={reload} disabled={loading} style={smallBtn}>
            <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>
              {loading ? 'sync' : 'refresh'}
            </span>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 14px', background: '#fdecea', color: '#b71c1c', fontSize: 12 }}>
          {error}
        </div>
      )}
      {info && (
        <div style={{ padding: '8px 14px', background: '#e8f8f4', color: '#0f8a72', fontSize: 12 }}>
          {info}
        </div>
      )}

      {items === null ? (
        <div style={{ padding: 14, color: '#6c7a87', fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 16, color: '#6c7a87', fontSize: 13 }}>
          No banks connected yet. Use <strong>Connect to bank</strong> above to link one.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={thStyle}>Institution</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Connected</th>
              <th style={thStyle}>Last sync</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const sc = STATUS_COLOR[it.status] || STATUS_COLOR.active;
              const busy = pendingId === it.id;
              return (
                <tr key={it.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>
                      {it.institution_name || `Item #${it.id}`}
                    </div>
                    {it.institution_id && (
                      <div style={{ fontSize: 10.5, color: '#9aa6b2', fontVariantNumeric: 'tabular-nums' }}>
                        {it.institution_id}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: sc.bg,
                        color: sc.fg,
                      }}
                    >
                      {it.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{fmtRelative(it.created_at)}</td>
                  <td style={tdStyle}>{fmtRelative(it.last_synced_at)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      type="button"
                      style={smallBtn}
                      disabled={busy}
                      onClick={() => handleSync(it.id)}
                    >
                      <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>
                        {busy ? 'sync' : 'cloud_sync'}
                      </span>
                      {busy ? 'Syncing…' : 'Sync'}
                    </button>
                    <button
                      type="button"
                      style={{ ...smallBtn, marginLeft: 6, color: '#b71c1c' }}
                      disabled={busy}
                      onClick={() => handleDisconnect(it.id)}
                    >
                      <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>
                        link_off
                      </span>
                      Disconnect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5ebf2',
  borderRadius: 10,
  overflow: 'hidden',
  marginBottom: 14,
};
const headStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #e5ebf2',
  background: '#f4f7fb',
  fontSize: 13,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 500,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#6c7a87',
  padding: '10px 14px',
  borderBottom: '1px solid #e5ebf2',
  background: '#f4f7fb',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #eef2f7',
  color: '#222',
};
const smallBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#fff',
  border: '1px solid #e5ebf2',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

export default PlaidBanksPanel;
