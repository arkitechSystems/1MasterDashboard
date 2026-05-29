/**
 * Thin fetch layer for the Setup / GL / Budget endpoints on the Express server.
 * Endpoints return 503 when the server has no DATABASE_URL — callers should
 * surface that gracefully and fall back to in-memory state.
 */

import { API_BASE_URL } from '../config';
import { authedFetch } from './authedFetch';

const url = (p: string) => `${API_BASE_URL}${p}`;

const json = async <T,>(res: Response): Promise<T> => {
  const text = await res.text();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) msg = parsed.error;
    } catch {
      /* keep status text */
    }
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
};

/* Wire types are kept loose; Admin.tsx owns the strict shapes. */
export type SetupBundle = {
  organization: {
    name: string;
    fiscalYearEndMonth: number;
    fiscalYearEndDay: number;
    numEntities: number;
  };
  coa: Array<{
    account: string;
    name: string;
    legacyGl: string;
    type: string;
    statement: '' | 'IS' | 'BS';
    line: string;
    dept: string;
    deptDescription: string;
    subAccount: string;
    active: boolean;
    bank?: string;
    bankAccountNumber?: string;
  }>;
  isLines: Array<StatementLineWire>;
  bsLines: Array<StatementLineWire>;
  deptList: Array<{ code: string; name: string }>;
  beginningTb: Array<{ account: string; balance: number }>;
};

export interface StatementLineWire {
  id: string;
  statement: 'IS' | 'BS';
  kind: 'header' | 'account' | 'subtotal' | 'formula';
  label: string;
  section: string;
  sign?: '+' | '-' | null;
  formula?: string | null;
  calcTerms?: Array<{ sign: '+' | '-'; label: string }> | null;
  bold?: boolean;
}

export interface BudgetRowWire {
  monthEnd: string;
  account: string;
  amount: number;
}

export interface GlDetailRowWire {
  template: string;
  date: string;
  monthEnd: string;
  account: string;
  description: string;
  memo: string;
  reference: string;
  journal: string;
  amount: number;
}

export const getSetup = async (): Promise<SetupBundle> =>
  json<SetupBundle>(await authedFetch(url('/api/setup')));

export const saveSetup = async (bundle: SetupBundle): Promise<void> => {
  await json(
    await authedFetch(url('/api/setup'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    }),
  );
};

export const getBudget = async (): Promise<BudgetRowWire[]> =>
  json<BudgetRowWire[]>(await authedFetch(url('/api/budget')));

export const saveBudget = async (rows: BudgetRowWire[]): Promise<void> => {
  await json(
    await authedFetch(url('/api/budget'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    }),
  );
};

export const getGlDetail = async (): Promise<GlDetailRowWire[]> =>
  json<GlDetailRowWire[]>(await authedFetch(url('/api/gl-detail')));

export const saveGlDetail = async (rows: GlDetailRowWire[]): Promise<void> => {
  await json(
    await authedFetch(url('/api/gl-detail'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    }),
  );
};

export interface GlDetailRowWithTxId extends GlDetailRowWire {
  txId: string;
}

export interface SupersedeCandidate {
  oldRow: GlDetailRowWithTxId;
  newRow: GlDetailRowWithTxId;
}

export interface GlMergeResult {
  inserted: number;
  skipped: number;
  total: number;
  candidates: SupersedeCandidate[];
}

export interface SupersedePair {
  oldTxId: string;
  newTxId: string;
}

/**
 * Mark old GL rows as superseded by new ones. Returns count of rows
 * updated. Safe to call with an empty array.
 */
export const applySupersedes = async (
  pairs: SupersedePair[],
): Promise<{ updated: number }> =>
  json<{ updated: number }>(
    await authedFetch(url('/api/gl-detail/supersede'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pairs),
    }),
  );

/**
 * Diff-only preview. Returns the counts the UI would see if it ran the
 * merge — no rows are written. Use this to drive a confirm dialog.
 */
export const previewMergeGlDetail = async (
  rows: GlDetailRowWire[],
): Promise<GlMergeResult> =>
  json<GlMergeResult>(
    await authedFetch(url('/api/gl-detail/preview-merge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    }),
  );

/**
 * Append-only upload. Each row gets a stable tx_id server-side; rows
 * already in gl_detail (including ones bound to Bank Recon matches) are
 * left untouched.
 */
export const mergeGlDetail = async (
  rows: GlDetailRowWire[],
): Promise<GlMergeResult> =>
  json<GlMergeResult>(
    await authedFetch(url('/api/gl-detail/merge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    }),
  );

export interface BankMappingWire {
  account: string;
  bank: string;
  bankAccountNumber: string;
}

export const saveBankMappings = async (rows: BankMappingWire[]): Promise<void> => {
  await json(
    await authedFetch(url('/api/coa/bank-mapping'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    }),
  );
};

/** Returns true if the server has Postgres configured. */
export const setupAvailable = async (): Promise<boolean> => {
  try {
    const res = await authedFetch(url('/api/setup'));
    if (res.status === 503) return false;
    return res.ok;
  } catch {
    return false;
  }
};
