// Primary-key + diff utilities for GL transactions served from gldet.json.
//
// Why this exists:
//   gldet.json has no row identifier of its own — historically rows were
//   identified by position or by an ad-hoc combination of fields. When an
//   adjusting JE is generated (e.g. from a completed bank reconciliation),
//   we need to know which transactions are already in the GL detail and
//   which are genuinely new, so we don't double-post. A deterministic
//   primary key derived from the natural identity of each row solves both:
//     1. The same source row always hashes to the same tx_id, so reloads
//        are idempotent.
//     2. Diffing two sets reduces to a Set membership check on tx_id.
//
// Stamp policy:
//   tx_id is stamped on every row as it enters the dashboard (see
//   fetchGLTransactions). Downstream code should treat tx_id as opaque.

import { API_ENDPOINTS } from '../config';
import { authedFetch } from './authedFetch';

export const TX_ID_FIELD = 'tx_id' as const;

// Fields that, together, uniquely identify a GL transaction in the source
// data. Order is fixed — changing it would invalidate previously-computed
// keys (which is fine for a one-time migration but should be deliberate).
//
// We include the journal/batch/seq triplet because that's the accounting
// system's own composite key. We also include amount + memo + reference
// as collision insurance for source systems that recycle journal/batch/seq
// across periods. Balance-only rows (no glj_date) still get a stable key
// because (glm_acc, ME) is unique for them.
const IDENTITY_FIELDS = [
  'glm_acc',
  'glj_date',
  'glj_journal',
  'glj_csnum',
  'glj_batch',
  'glj_seq',
  'glj_amt',
  'glj_reference',
  'glj_memo',
  'ME',
  'detail_year',
  'detail_month',
] as const;

export interface GLIdentityFields {
  glm_acc?: unknown;
  glj_date?: unknown;
  glj_journal?: unknown;
  glj_csnum?: unknown;
  glj_batch?: unknown;
  glj_seq?: unknown;
  glj_amt?: unknown;
  glj_reference?: unknown;
  glj_memo?: unknown;
  ME?: unknown;
  detail_year?: unknown;
  detail_month?: unknown;
}

export type WithTxId<T> = T & { [TX_ID_FIELD]: string };

// cyrb53 — a small, fast, 53-bit non-cryptographic hash. Collision space
// is ~9 quadrillion, which is many orders of magnitude beyond any realistic
// GL volume. Output is base36 so it stays short and URL-safe.
function cyrb53(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36);
}

function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

// Compute the stable primary key for a single GL row from its natural-key
// fields. Pure function — same input → same output, forever.
export function computeTxId(row: GLIdentityFields): string {
  const canonical = IDENTITY_FIELDS
    .map((field) => canonicalize((row as Record<string, unknown>)[field]))
    .join('|');
  return 'tx_' + cyrb53(canonical);
}

// Stamp a tx_id onto every row. Returns a new array; inputs are not mutated.
// If a row already carries a tx_id, that value is preserved — this lets
// externally-generated entries (e.g. adjusting JEs from bank recon) keep
// the ID they were assigned at creation time.
export function assignTxIds<T extends GLIdentityFields>(rows: T[]): WithTxId<T>[] {
  return rows.map((row) => {
    const existing = (row as Record<string, unknown>)[TX_ID_FIELD];
    const tx_id = typeof existing === 'string' && existing.length > 0
      ? existing
      : computeTxId(row);
    return { ...row, [TX_ID_FIELD]: tx_id } as WithTxId<T>;
  });
}

// Given the set of GL rows already in the gl_detail table and a set of
// candidate rows (e.g. adjusting JEs proposed by the bank-recon workflow),
// return only the candidates whose tx_id is not already present.
//
// Both inputs are stamped on the way in, so callers don't need to pre-assign
// tx_ids — pass raw rows from either side and the diff is computed from
// each row's natural identity.
export function findNewTransactions<T extends GLIdentityFields>(
  existing: ReadonlyArray<GLIdentityFields & { [TX_ID_FIELD]?: string }>,
  candidates: ReadonlyArray<T>,
): WithTxId<T>[] {
  const existingIds = new Set<string>();
  for (const row of existing) {
    const known = row[TX_ID_FIELD];
    existingIds.add(typeof known === 'string' && known.length > 0 ? known : computeTxId(row));
  }
  const out: WithTxId<T>[] = [];
  for (const cand of candidates) {
    const tx_id = computeTxId(cand);
    if (!existingIds.has(tx_id)) {
      out.push({ ...cand, [TX_ID_FIELD]: tx_id } as WithTxId<T>);
    }
  }
  return out;
}

// Fetch the raw GL detail and stamp every row with its tx_id before
// handing it back. This is the single entry point every dashboard view
// should use — call sites that bypass it will see rows without tx_id
// and break the diff workflow.
export async function fetchGLTransactions<T extends GLIdentityFields = GLIdentityFields>(
  options: { token?: string | null; signal?: AbortSignal } = {},
): Promise<WithTxId<T>[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = options.token ?? (typeof localStorage !== 'undefined'
    ? localStorage.getItem('authToken')
    : null);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await authedFetch(API_ENDPOINTS.GL_DATA, { headers, signal: options.signal });
  if (!res.ok) {
    throw new Error(`Failed to load GL data: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('GL data response was not an array');
  }
  return assignTxIds<T>(raw as T[]);
}
