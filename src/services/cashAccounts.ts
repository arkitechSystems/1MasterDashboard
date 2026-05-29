/**
 * Derives the list of "cash" GL accounts to surface on the Bank Recon
 * landing. Source of truth:
 *
 *   1. Pull CoA + BS lines from /api/setup (Postgres). Find BS lines whose
 *      label matches /cash|cash equiv|short-term invest/i. Filter CoA rows
 *      whose `line` field points at one of those BS lines.
 *
 *   2. Fallback (Postgres returns 503 or fetch fails): scan gldet.json for
 *      unique accounts where the `FS_Sub_Group ` (note trailing space)
 *      field contains "cash" or "short-term".
 *
 * The fallback exists so the landing page still works on the static
 * GitHub-Pages demo deploy where there is no DB.
 */

import { getSetup, SetupBundle } from './setupApi';
import { fetchGLTransactions } from './glTransactions';

export interface CashAccount {
  gl: string;
  description: string;
  category: string;          // BS line label, or FS_Sub_Group when from fallback
  bank: string;              // editable; saved to CoA via /api/coa/bank-mapping
  bankAccountNumber: string;
  source: 'setup' | 'gldet'; // tells the UI whether bank fields can be persisted
}

const CASH_LABEL_RE = /cash|cash\s*equiv|short[\s-]*term\s*invest/i;

const fromSetup = (bundle: SetupBundle): CashAccount[] => {
  const cashLineIds = new Set<string>();
  for (const line of bundle.bsLines) {
    if (CASH_LABEL_RE.test(line.label)) cashLineIds.add(line.id);
  }
  if (cashLineIds.size === 0) return [];

  return bundle.coa
    .filter((c) => c.active && cashLineIds.has(c.line))
    .map((c) => ({
      gl: c.account,
      description: c.name,
      category:
        bundle.bsLines.find((l) => l.id === c.line)?.label || 'Cash',
      bank: c.bank || '',
      bankAccountNumber: c.bankAccountNumber || '',
      source: 'setup' as const,
    }));
};

const fromGldet = async (): Promise<CashAccount[]> => {
  type Row = {
    glm_acc?: unknown;
    glm_desc?: unknown;
    ['FS_Sub_Group ']?: unknown;
  };
  const rows = await fetchGLTransactions<Row>();
  const seen = new Map<string, CashAccount>();
  for (const r of rows) {
    const group = String(r['FS_Sub_Group '] ?? '').trim();
    if (!CASH_LABEL_RE.test(group)) continue;
    const gl = String(r.glm_acc ?? '').trim();
    if (!gl || seen.has(gl)) continue;
    seen.set(gl, {
      gl,
      description: String(r.glm_desc ?? '').trim(),
      category: group,
      bank: '',
      bankAccountNumber: '',
      source: 'gldet',
    });
  }
  return Array.from(seen.values()).sort((a, b) => a.gl.localeCompare(b.gl));
};

export const fetchCashAccounts = async (): Promise<CashAccount[]> => {
  try {
    const bundle = await getSetup();
    const accounts = fromSetup(bundle);
    if (accounts.length > 0) return accounts;
    // Setup is configured but no BS lines match — fall through to gldet so
    // the user still sees something while they fix the BS line labels.
  } catch (e: any) {
    // 503 (no DB), 401 (no token), or network error — fall back to gldet.
    if (e?.status !== 503 && e?.status !== 401) {
      console.warn('[cashAccounts] /api/setup failed, falling back:', e);
    }
  }
  return fromGldet();
};
