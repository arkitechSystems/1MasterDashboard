// Frontend client for the server's /api/plaid/* endpoints.
//
// All functions go through API_BASE_URL. In static-mode builds (no
// REACT_APP_API_URL), API_BASE_URL is '' and these calls hit relative paths
// that won't exist — callers should gate this whole feature on
// `process.env.REACT_APP_API_URL` being set.

import { API_BASE_URL } from '../config';
import { BankRow } from '../components/bank-recon/data';
import { authedFetch } from './authedFetch';

export interface PlaidStatus {
  configured: boolean;
  env: 'sandbox' | 'development' | 'production';
}

export interface PlaidItem {
  id: number;
  institution_id: string | null;
  institution_name: string | null;
  status: 'active' | 'login_required' | 'error' | string;
  last_synced_at: number | null;
  created_at: number;
}

const json = async <T,>(resp: Response): Promise<T> => {
  if (!resp.ok) {
    let detail = '';
    try { detail = JSON.stringify(await resp.json()); } catch { /* noop */ }
    throw new Error(`HTTP ${resp.status}: ${detail || resp.statusText}`);
  }
  return resp.json() as Promise<T>;
};

export const fetchPlaidStatus = async (): Promise<PlaidStatus> => {
  return json<PlaidStatus>(await authedFetch(`${API_BASE_URL}/api/plaid/status`));
};

export const fetchLinkToken = async (): Promise<{ link_token: string; expiration: string }> => {
  return json(await authedFetch(`${API_BASE_URL}/api/plaid/link-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }));
};

export const exchangePublicToken = async (
  publicToken: string,
): Promise<{ id: number; institution_name: string | null }> => {
  return json(await authedFetch(`${API_BASE_URL}/api/plaid/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  }));
};

export const listPlaidItems = async (): Promise<PlaidItem[]> => {
  return json<PlaidItem[]>(await authedFetch(`${API_BASE_URL}/api/plaid/items`));
};

export const syncPlaidItem = async (
  id: number,
): Promise<{ added: number; modified: number; removed: number }> => {
  return json(await authedFetch(`${API_BASE_URL}/api/plaid/items/${id}/sync`, {
    method: 'POST',
  }));
};

export const disconnectPlaidItem = async (id: number): Promise<void> => {
  await json(await authedFetch(`${API_BASE_URL}/api/plaid/items/${id}`, {
    method: 'DELETE',
  }));
};

export const fetchBankTransactions = async (
  meStart: number,
  meEnd: number,
): Promise<BankRow[]> => {
  const params = new URLSearchParams({
    me_start: String(meStart),
    me_end: String(meEnd),
  });
  return json<BankRow[]>(
    await authedFetch(`${API_BASE_URL}/api/bank-transactions?${params}`),
  );
};
