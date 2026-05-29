/**
 * Stable primary key for gl_detail rows.
 *
 * Why this exists: the legacy Setup upload (PUT /api/gl-detail) was a
 * delete-all + insert-all replace. That worked when the dashboard owned
 * the GL data, but the moment any row in gl_detail is referenced from
 * Bank Recon (matchNum bindings, AI recon proposals, etc.) a full
 * replace silently destroys that history. The merge endpoint replaces
 * the destructive path with INSERT … ON CONFLICT (tx_id) DO NOTHING so
 * rows already in the DB are left untouched.
 *
 * The identity fields below are intentionally the GL row's natural-key
 * columns (the ones that would distinguish two real-world transactions
 * even if everything else changed). Order is fixed — reordering would
 * silently invalidate previously-computed keys.
 *
 * NOTE: This is distinct from the client-side computeTxId in
 * `src/services/glTransactions.ts`. That one hashes the *legacy*
 * gldet.json field names (`glm_acc`, `glj_date`, `glj_amt`, …). This
 * server-side hash operates on the clean `GlDetailRow` shape used by
 * the Postgres `gl_detail` table — the two are deliberately independent
 * because they operate on different data layouts.
 */

export interface TxIdInput {
  account?: unknown;
  date?: unknown;
  monthEnd?: unknown;
  journal?: unknown;
  reference?: unknown;
  amount?: unknown;
  memo?: unknown;
  description?: unknown;
}

const IDENTITY_FIELDS = [
  'account',
  'date',
  'monthEnd',
  'journal',
  'reference',
  'amount',
  'memo',
  'description',
] as const;

// cyrb53 — small, fast, 53-bit non-cryptographic hash. Collision space
// ~9 quadrillion which is many orders of magnitude beyond any realistic
// GL volume. Output is base36 so it stays short and URL-safe.
const cyrb53 = (input: string, seed = 0): string => {
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
};

const canonicalize = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
};

export const computeGlDetailTxId = (row: TxIdInput): string => {
  const canonical = IDENTITY_FIELDS
    .map((field) => canonicalize((row as Record<string, unknown>)[field]))
    .join('|');
  return 'tx_' + cyrb53(canonical);
};
