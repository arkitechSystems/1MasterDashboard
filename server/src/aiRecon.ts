/**
 * Bank-reconciliation engine. Shared by all three AI recon tiers:
 *   Tier 1 — deterministic matcher + Claude tiebreaker on unmatched
 *   Tier 2 — Claude drives via tool use (find_gl_*, propose_match, etc.)
 *   Tier 3 — autonomous loop until done; same tools, no human in the loop
 *
 * The engine works against whatever data is in Postgres (`gl_detail`) and the
 * legacy SQLite Plaid tables (`bank_transactions`). It returns plain objects so
 * the endpoints can pass them straight to Claude.
 */

import { Pool } from 'pg';
import { listBankTxns, BankTransactionRow } from './db';

/* ── Shapes used across tiers ─────────────────────────────────────────── */

export interface BankLine {
  id: number;
  date: string;          // ISO yyyy-mm-dd
  amount: number;        // bank sign (deposit positive, withdrawal negative)
  description: string;
  reference: string;     // check #, ACH ref, etc.
}

export interface GlLine {
  id: number;
  date: string;          // mm/dd/yyyy as stored in gl_detail
  monthEnd: string;
  account: string;
  description: string;
  memo: string;
  reference: string;
  journal: string;
  amount: number;
}

export interface Match {
  bankId: number;
  glIds: number[];
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ReconException {
  bankId?: number;
  glId?: number;
  kind: 'no_gl_match' | 'no_bank_match' | 'duplicate' | 'timing' | 'other';
  message: string;
}

export interface ReconResult {
  matches: Match[];
  suggestions: Match[];   // proposed but not auto-applied (Tier 1)
  exceptions: ReconException[];
  stats: {
    bankRows: number;
    glRows: number;
    matchedRows: number;
    suggestedRows: number;
    unmatchedBank: number;
    unmatchedGl: number;
  };
}

/* ── Load a recon batch by month-end ──────────────────────────────────── */

const meSerial = (monthEnd: string): number => {
  // monthEnd is "mm/dd/yyyy"; turn into yyyymm for the bank_transactions.me index.
  const m = /^(\d{1,2})\/\d{1,2}\/(\d{4})$/.exec(monthEnd);
  if (!m) return 0;
  return Number(m[2]) * 100 + Number(m[1]);
};

const isoFromBankTs = (epochSeconds: number): string => {
  const d = new Date(epochSeconds * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export const loadReconBatch = async (
  pgPool: Pool | null,
  tenantId: string,
  monthEnd: string,
): Promise<{ bank: BankLine[]; gl: GlLine[] }> => {
  const me = meSerial(monthEnd);
  const bankRows: BankTransactionRow[] = listBankTxns.all({
    tenant_id: tenantId,
    me_start: me,
    me_end: me,
  });
  const bank: BankLine[] = bankRows.map((r) => ({
    id: r.id,
    date: isoFromBankTs(r.date),
    amount: r.amount,
    description: r.description || '',
    reference: r.check_number || '',
  }));

  let gl: GlLine[] = [];
  if (pgPool) {
    const r = await pgPool.query(
      `SELECT id, date, month_end, account, description, memo, reference, journal, amount
         FROM gl_detail WHERE month_end = $1 ORDER BY id`,
      [monthEnd],
    );
    gl = r.rows.map((row) => ({
      id: row.id,
      date: row.date,
      monthEnd: row.month_end,
      account: row.account,
      description: row.description,
      memo: row.memo,
      reference: row.reference,
      journal: row.journal,
      amount: Number(row.amount),
    }));
  }

  return { bank, gl };
};

/* ── Deterministic matcher ────────────────────────────────────────────── */

const daysBetween = (isoA: string, mmDdYyyyB: string): number => {
  const a = new Date(isoA);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mmDdYyyyB);
  if (!m) return 999;
  const b = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return Math.abs((a.getTime() - b.getTime()) / 86_400_000);
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const descSimilarity = (a: string, b: string): number => {
  const sa = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  const sb = new Set(norm(b).split(' ').filter((w) => w.length > 2));
  if (sa.size === 0 || sb.size === 0) return 0;
  let overlap = 0;
  sa.forEach((w) => {
    if (sb.has(w)) overlap++;
  });
  return overlap / Math.max(sa.size, sb.size);
};

/**
 * Three signs:
 *   • bank deposits are positive, withdrawals negative
 *   • GL on the cash account has the opposite convention (a customer payment
 *     debits cash → positive in the GL, credits cash → negative)
 *   • we expect bank.amount == gl.amount in magnitude, opposite sign — but in
 *     practice we see both conventions in the wild; match on |a| == |b|.
 */
const amountsMatch = (bankAmt: number, glAmt: number): boolean =>
  Math.abs(Math.abs(bankAmt) - Math.abs(glAmt)) < 0.005;

export const deterministicMatch = (
  bank: BankLine[],
  gl: GlLine[],
): {
  matches: Match[];
  unmatchedBank: BankLine[];
  unmatchedGl: GlLine[];
} => {
  const matches: Match[] = [];
  const consumedBank = new Set<number>();
  const consumedGl = new Set<number>();

  // Pass 1: exact amount + same reference/check# → high confidence
  for (const b of bank) {
    if (consumedBank.has(b.id) || !b.reference) continue;
    for (const g of gl) {
      if (consumedGl.has(g.id)) continue;
      if (!amountsMatch(b.amount, g.amount)) continue;
      const refMatch =
        b.reference &&
        (g.reference?.includes(b.reference) ||
          g.journal?.includes(b.reference) ||
          g.memo?.includes(b.reference));
      if (refMatch && daysBetween(b.date, g.date) <= 5) {
        matches.push({
          bankId: b.id,
          glIds: [g.id],
          confidence: 'high',
          reason: `Amount + reference ${b.reference} match`,
        });
        consumedBank.add(b.id);
        consumedGl.add(g.id);
        break;
      }
    }
  }

  // Pass 2: exact amount + close date (±3 days) + reasonable description overlap
  for (const b of bank) {
    if (consumedBank.has(b.id)) continue;
    let best: { g: GlLine; score: number } | null = null;
    for (const g of gl) {
      if (consumedGl.has(g.id)) continue;
      if (!amountsMatch(b.amount, g.amount)) continue;
      const dd = daysBetween(b.date, g.date);
      if (dd > 3) continue;
      const sim = Math.max(
        descSimilarity(b.description, g.description),
        descSimilarity(b.description, g.memo),
      );
      const score = (1 - dd / 4) * 0.5 + sim * 0.5;
      if (!best || score > best.score) best = { g, score };
    }
    if (best && best.score >= 0.45) {
      matches.push({
        bankId: b.id,
        glIds: [best.g.id],
        confidence: best.score >= 0.7 ? 'high' : 'medium',
        reason: `Amount + date (±${Math.round(daysBetween(b.date, best.g.date))}d) + ${(best.score * 100).toFixed(0)}% description overlap`,
      });
      consumedBank.add(b.id);
      consumedGl.add(best.g.id);
    }
  }

  const unmatchedBank = bank.filter((b) => !consumedBank.has(b.id));
  const unmatchedGl = gl.filter((g) => !consumedGl.has(g.id));
  return { matches, unmatchedBank, unmatchedGl };
};

/* ── Tool implementations (Tier 2 / 3) ────────────────────────────────── */

export const findGlByAmount = (
  gl: GlLine[],
  amount: number,
  tolerance = 0.005,
): GlLine[] =>
  gl.filter((g) => Math.abs(Math.abs(g.amount) - Math.abs(amount)) <= tolerance);

export const findGlByDescription = (gl: GlLine[], query: string): GlLine[] => {
  const q = norm(query);
  if (!q) return [];
  const terms = q.split(' ').filter((t) => t.length > 2);
  return gl
    .map((g) => {
      const blob = norm(`${g.description} ${g.memo} ${g.reference} ${g.journal}`);
      let hits = 0;
      terms.forEach((t) => {
        if (blob.includes(t)) hits++;
      });
      return { g, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 20)
    .map((x) => x.g);
};

export const findGlByJournal = (gl: GlLine[], journal: string): GlLine[] => {
  const q = norm(journal);
  return gl.filter((g) => norm(g.journal).includes(q) || norm(g.reference).includes(q));
};

/* ── Candidate builder used by Tier 1 ─────────────────────────────────── */

export interface BankWithCandidates {
  bank: BankLine;
  candidates: GlLine[];
}

export const buildCandidates = (
  unmatchedBank: BankLine[],
  unmatchedGl: GlLine[],
): BankWithCandidates[] =>
  unmatchedBank.map((b) => {
    const byAmount = findGlByAmount(unmatchedGl, b.amount, Math.abs(b.amount) * 0.005);
    const byDesc = findGlByDescription(unmatchedGl, b.description);
    const seen = new Set<number>();
    const merged: GlLine[] = [];
    [...byAmount, ...byDesc].forEach((g) => {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        merged.push(g);
      }
    });
    // Cap to keep the prompt small.
    return { bank: b, candidates: merged.slice(0, 8) };
  });

/* ── Serializer — compact, model-friendly text representation ─────────── */

export const fmtBank = (b: BankLine): string =>
  `bank#${b.id} ${b.date} ${b.amount.toFixed(2)} ref=${b.reference || '-'} "${b.description.slice(0, 80)}"`;

export const fmtGl = (g: GlLine): string =>
  `gl#${g.id} ${g.date} ${g.amount.toFixed(2)} acct=${g.account} jrnl=${g.journal || '-'} "${(g.description || g.memo).slice(0, 80)}"`;
