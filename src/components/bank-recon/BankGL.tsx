import React, { useState, useMemo } from 'react';
import { BankRow, GLRow, excelSerialToString, formatAmount, amountColor } from './data';
import './BankGL.css';

interface BankGLProps {
  bankData: BankRow[];
  setBankData: React.Dispatch<React.SetStateAction<BankRow[]>>;
  glData: GLRow[];
  setGlData: React.Dispatch<React.SetStateAction<GLRow[]>>;
  savedSnapshot: { bank: BankRow[]; gl: GLRow[] };
  setSavedSnapshot: React.Dispatch<React.SetStateAction<{ bank: BankRow[]; gl: GLRow[] }>>;
  matchNumFilter: number | null;
  setMatchNumFilter: (v: number | null) => void;
}

type SortDir = 'asc' | 'desc';

const sortRows = <T,>(rows: T[], key: keyof T | null, dir: SortDir): T[] => {
  if (!key) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return dir === 'asc' ? sorted : sorted.reverse();
};

// ─── Sortable header (new design — icon-based indicator) ───
interface SortableHeaderProps {
  label: string;
  field: string;
  activeField: string | null;
  dir: SortDir;
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
}

const SortableHeader: React.FC<SortableHeaderProps> = ({ label, field, activeField, dir, onSort, align = 'left' }) => {
  const isActive = activeField === field;
  const alignClass = align === 'right' ? 'r' : align === 'center' ? 'c' : '';
  const icon = !isActive ? 'unfold_more' : dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  return (
    <th
      className={`sortable ${isActive ? 'active' : ''} ${alignClass}`}
      onClick={() => onSort(field)}
      title={`Sort by ${label}`}
    >
      <span>{label}</span>
      <span className="material-icons sort-ico" aria-hidden="true">{icon}</span>
    </th>
  );
};

// ─── Amount span with .amt / .neg / .pos / .zero ───
const Amt: React.FC<{ value: number }> = ({ value }) => {
  const cls = value < 0 ? 'neg' : value > 0 ? 'pos' : 'zero';
  return <span className={`amt ${cls}`}>{formatAmount(value)}</span>;
};

// ─── Match # chip (used in modal — keeps old inline style) ───
// Preserved as a fallback for non-class consumers, but the table cells
// render the new design directly.
const amountStyleInline = (amount: number): React.CSSProperties => ({
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  color: amountColor(amount),
  whiteSpace: 'nowrap',
});

type ProposedMatch =
  | { kind: 'cross'; matchNum: number; bankIdx: number; glIdx: number }
  | { kind: 'bank-pair'; matchNum: number; bankIdx1: number; bankIdx2: number }
  | { kind: 'gl-pair'; matchNum: number; glIdx1: number; glIdx2: number }
  | { kind: 'cross-one-many'; matchNum: number; bankIdx: number; glIdxs: number[] }
  | { kind: 'cross-many-one'; matchNum: number; bankIdxs: number[]; glIdx: number }
  | { kind: 'many-many'; matchNum: number; bankIdxs: number[]; glIdxs: number[] };

type AutoMatchCandidate =
  | { kind: 'cross'; bankIdx: number; glIdx: number }
  | { kind: 'bank-pair'; bankIdx1: number; bankIdx2: number }
  | { kind: 'gl-pair'; glIdx1: number; glIdx2: number }
  | { kind: 'cross-one-many'; bankIdx: number; glIdxs: number[] }
  | { kind: 'cross-many-one'; bankIdxs: number[]; glIdx: number }
  | { kind: 'many-many'; bankIdxs: number[]; glIdxs: number[] };

function findSubsetSummingTo<T extends { amount: number; matchNum: number }>(
  items: T[],
  target: number,
  opts: { minSize: number; maxSize: number },
): number[] | null {
  const candIdxs: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].matchNum === 0 && Math.abs(items[i].amount) >= 0.005) {
      candIdxs.push(i);
    }
  }
  const path: number[] = [];
  let found: number[] | null = null;
  const dfs = (start: number, sum: number) => {
    if (found) return;
    if (path.length >= opts.minSize && Math.abs(sum - target) < 0.005) {
      found = path.map((i) => candIdxs[i]);
      return;
    }
    if (path.length >= opts.maxSize) return;
    for (let i = start; i < candIdxs.length && !found; i++) {
      path.push(i);
      dfs(i + 1, sum + items[candIdxs[i]].amount);
      path.pop();
    }
  };
  dfs(0, 0);
  return found;
}

const ONE_TO_MANY_MAX = 6;
const MANY_TO_MANY_MAX = 4;

const findFirstAutoMatch = (bank: BankRow[], gl: GLRow[]): AutoMatchCandidate | null => {
  for (let bi = 0; bi < bank.length; bi++) {
    if (bank[bi].matchNum !== 0) continue;
    for (let gi = 0; gi < gl.length; gi++) {
      if (gl[gi].matchNum !== 0) continue;
      if (Math.abs(bank[bi].amount - gl[gi].amount) < 0.005) {
        return { kind: 'cross', bankIdx: bi, glIdx: gi };
      }
    }
  }
  for (let i = 0; i < bank.length; i++) {
    if (bank[i].matchNum !== 0) continue;
    if (Math.abs(bank[i].amount) < 0.005) continue;
    for (let j = i + 1; j < bank.length; j++) {
      if (bank[j].matchNum !== 0) continue;
      if (Math.abs(bank[i].amount + bank[j].amount) < 0.005) {
        return { kind: 'bank-pair', bankIdx1: i, bankIdx2: j };
      }
    }
  }
  for (let i = 0; i < gl.length; i++) {
    if (gl[i].matchNum !== 0) continue;
    if (Math.abs(gl[i].amount) < 0.005) continue;
    for (let j = i + 1; j < gl.length; j++) {
      if (gl[j].matchNum !== 0) continue;
      if (Math.abs(gl[i].amount + gl[j].amount) < 0.005) {
        return { kind: 'gl-pair', glIdx1: i, glIdx2: j };
      }
    }
  }
  for (let bi = 0; bi < bank.length; bi++) {
    if (bank[bi].matchNum !== 0) continue;
    if (Math.abs(bank[bi].amount) < 0.005) continue;
    const subset = findSubsetSummingTo(gl, bank[bi].amount, { minSize: 2, maxSize: ONE_TO_MANY_MAX });
    if (subset) return { kind: 'cross-one-many', bankIdx: bi, glIdxs: subset };
  }
  for (let gi = 0; gi < gl.length; gi++) {
    if (gl[gi].matchNum !== 0) continue;
    if (Math.abs(gl[gi].amount) < 0.005) continue;
    const subset = findSubsetSummingTo(bank, gl[gi].amount, { minSize: 2, maxSize: ONE_TO_MANY_MAX });
    if (subset) return { kind: 'cross-many-one', bankIdxs: subset, glIdx: gi };
  }
  const bankCands: number[] = [];
  for (let i = 0; i < bank.length; i++) {
    if (bank[i].matchNum === 0 && Math.abs(bank[i].amount) >= 0.005) bankCands.push(i);
  }
  const path: number[] = [];
  let mm: AutoMatchCandidate | null = null;
  const enumerateBank = (start: number, sum: number) => {
    if (mm) return;
    if (path.length >= 2 && Math.abs(sum) >= 0.005) {
      const glSubset = findSubsetSummingTo(gl, sum, { minSize: 2, maxSize: MANY_TO_MANY_MAX });
      if (glSubset) {
        mm = { kind: 'many-many', bankIdxs: path.map((p) => bankCands[p]), glIdxs: glSubset };
        return;
      }
    }
    if (path.length >= MANY_TO_MANY_MAX) return;
    for (let i = start; i < bankCands.length && !mm; i++) {
      path.push(i);
      enumerateBank(i + 1, sum + bank[bankCands[i]].amount);
      path.pop();
    }
  };
  enumerateBank(0, 0);
  return mm;
};

const findFirstCheckMatch = (bank: BankRow[], gl: GLRow[]): AutoMatchCandidate | null => {
  const norm = (s: string) => s.trim();
  for (let bi = 0; bi < bank.length; bi++) {
    if (bank[bi].matchNum !== 0) continue;
    const bCheck = norm(bank[bi].checkNumber);
    if (!bCheck) continue;
    for (let gi = 0; gi < gl.length; gi++) {
      if (gl[gi].matchNum !== 0) continue;
      if (norm(gl[gi].checkNumber) === bCheck) {
        return { kind: 'cross', bankIdx: bi, glIdx: gi };
      }
    }
  }
  return null;
};

const nextMatchNum = (bank: BankRow[], gl: GLRow[]): number => {
  const maxNum = Math.max(
    0,
    ...bank.map((r) => r.matchNum),
    ...gl.map((r) => r.matchNum),
  );
  return maxNum + 1;
};

const BankGL: React.FC<BankGLProps> = ({
  bankData,
  setBankData,
  glData,
  setGlData,
  savedSnapshot,
  setSavedSnapshot,
  matchNumFilter,
  setMatchNumFilter,
}) => {
  const [bankSort, setBankSort] = useState<{ field: keyof BankRow | null; dir: SortDir }>({ field: null, dir: 'asc' });
  const [glSort, setGlSort] = useState<{ field: keyof GLRow | null; dir: SortDir }>({ field: null, dir: 'asc' });
  const [proposedMatch, setProposedMatch] = useState<ProposedMatch | null>(null);
  const [autoMatchMsg, setAutoMatchMsg] = useState<string | null>(null);

  const handleBankSort = (field: string) => {
    setBankSort((prev) => ({
      field: field as keyof BankRow,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };
  const handleGlSort = (field: string) => {
    setGlSort((prev) => ({
      field: field as keyof GLRow,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Note: design dims rows that don't match the active filter (instead of
  // hiding them) so cross-tab context is preserved.
  const sortedBank = useMemo(() => {
    const indexed = bankData.map((row, idx) => ({ ...row, __idx: idx }));
    return sortRows(indexed, bankSort.field as keyof typeof indexed[0] | null, bankSort.dir);
  }, [bankData, bankSort]);

  const sortedGL = useMemo(() => {
    const indexed = glData.map((row, idx) => ({ ...row, __idx: idx }));
    return sortRows(indexed, glSort.field as keyof typeof indexed[0] | null, glSort.dir);
  }, [glData, glSort]);

  const bankTotal = bankData.reduce((s, r) => s + r.amount, 0);
  const glTotal = glData.reduce((s, r) => s + r.amount, 0);
  const variance = bankTotal - glTotal;

  const bankMatched   = bankData.filter((r) => r.matchNum > 0).length;
  const bankUnmatched = bankData.length - bankMatched;
  const glMatched     = glData.filter((r) => r.matchNum > 0).length;
  const glUnmatched   = glData.length - glMatched;

  const matchedPairs = Math.min(bankMatched, glMatched);
  const totalUnmatched = bankUnmatched + glUnmatched;
  const progressPct = bankData.length === 0
    ? 0
    : Math.round((bankMatched / bankData.length) * 100);

  const updateBankMatch = (idx: number, raw: string) => {
    const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    setBankData((prev) => prev.map((r, i) => (i === idx ? { ...r, matchNum: parsed } : r)));
  };

  const updateGlMatch = (idx: number, raw: string) => {
    const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    setGlData((prev) => prev.map((r, i) => (i === idx ? { ...r, matchNum: parsed } : r)));
  };

  const isDirty = useMemo(() => {
    const bankChanged = bankData.some((r, i) => r.matchNum !== savedSnapshot.bank[i]?.matchNum);
    const glChanged = glData.some((r, i) => r.matchNum !== savedSnapshot.gl[i]?.matchNum);
    return bankChanged || glChanged;
  }, [bankData, glData, savedSnapshot]);

  const handleSave = () => {
    console.log('Saving match numbers', {
      bank: bankData.map((r) => ({ description: r.description, matchNum: r.matchNum })),
      gl: glData.map((r) => ({ memo: r.memo, matchNum: r.matchNum })),
    });
    setSavedSnapshot({ bank: bankData, gl: glData });
  };

  const handleReset = () => {
    setBankData(savedSnapshot.bank);
    setGlData(savedSnapshot.gl);
  };

  const proposeFromCandidate = (
    candidate: AutoMatchCandidate,
    bank: BankRow[],
    gl: GLRow[],
  ): ProposedMatch => {
    const matchNum = nextMatchNum(bank, gl);
    switch (candidate.kind) {
      case 'cross':
        return { kind: 'cross', matchNum, bankIdx: candidate.bankIdx, glIdx: candidate.glIdx };
      case 'bank-pair':
        return { kind: 'bank-pair', matchNum, bankIdx1: candidate.bankIdx1, bankIdx2: candidate.bankIdx2 };
      case 'gl-pair':
        return { kind: 'gl-pair', matchNum, glIdx1: candidate.glIdx1, glIdx2: candidate.glIdx2 };
      case 'cross-one-many':
        return { kind: 'cross-one-many', matchNum, bankIdx: candidate.bankIdx, glIdxs: candidate.glIdxs };
      case 'cross-many-one':
        return { kind: 'cross-many-one', matchNum, bankIdxs: candidate.bankIdxs, glIdx: candidate.glIdx };
      case 'many-many':
        return { kind: 'many-many', matchNum, bankIdxs: candidate.bankIdxs, glIdxs: candidate.glIdxs };
    }
  };

  const handleAutoMatch = () => {
    setAutoMatchMsg(null);
    const candidate = findFirstAutoMatch(bankData, glData);
    if (!candidate) {
      setAutoMatchMsg('No penny-perfect matches or offsetting pairs found among unmatched rows.');
      return;
    }
    setProposedMatch(proposeFromCandidate(candidate, bankData, glData));
  };

  const handleMatchChecks = () => {
    setAutoMatchMsg(null);
    const candidate = findFirstCheckMatch(bankData, glData);
    if (!candidate) {
      setAutoMatchMsg('No matching check numbers found between unmatched Bank and GL rows.');
      return;
    }
    setProposedMatch(proposeFromCandidate(candidate, bankData, glData));
  };

  const approveProposedMatch = () => {
    if (!proposedMatch) return;
    const { matchNum } = proposedMatch;
    const bankIdxsToUpdate = new Set<number>();
    const glIdxsToUpdate = new Set<number>();
    switch (proposedMatch.kind) {
      case 'cross':
        bankIdxsToUpdate.add(proposedMatch.bankIdx);
        glIdxsToUpdate.add(proposedMatch.glIdx);
        break;
      case 'bank-pair':
        bankIdxsToUpdate.add(proposedMatch.bankIdx1);
        bankIdxsToUpdate.add(proposedMatch.bankIdx2);
        break;
      case 'gl-pair':
        glIdxsToUpdate.add(proposedMatch.glIdx1);
        glIdxsToUpdate.add(proposedMatch.glIdx2);
        break;
      case 'cross-one-many':
        bankIdxsToUpdate.add(proposedMatch.bankIdx);
        proposedMatch.glIdxs.forEach((i) => glIdxsToUpdate.add(i));
        break;
      case 'cross-many-one':
        proposedMatch.bankIdxs.forEach((i) => bankIdxsToUpdate.add(i));
        glIdxsToUpdate.add(proposedMatch.glIdx);
        break;
      case 'many-many':
        proposedMatch.bankIdxs.forEach((i) => bankIdxsToUpdate.add(i));
        proposedMatch.glIdxs.forEach((i) => glIdxsToUpdate.add(i));
        break;
    }
    const newBank = bankIdxsToUpdate.size
      ? bankData.map((r, i) => (bankIdxsToUpdate.has(i) ? { ...r, matchNum } : r))
      : bankData;
    const newGl = glIdxsToUpdate.size
      ? glData.map((r, i) => (glIdxsToUpdate.has(i) ? { ...r, matchNum } : r))
      : glData;
    setBankData(newBank);
    setGlData(newGl);

    const next = findFirstAutoMatch(newBank, newGl);
    if (next) {
      setProposedMatch(proposeFromCandidate(next, newBank, newGl));
    } else {
      setProposedMatch(null);
      setAutoMatchMsg('All penny-perfect matches and offsetting/grouped sets have been processed.');
    }
  };

  const denyProposedMatch = () => {
    setProposedMatch(null);
  };

  // ─── Modal helpers (preserved from old design — modal is unchanged) ───
  const renderModal = () => {
    if (!proposedMatch) return null;
    let leftSide: 'bank' | 'gl', rightSide: 'bank' | 'gl';
    let leftRows: (BankRow | GLRow)[], rightRows: (BankRow | GLRow)[];
    let kindLabel: string;
    switch (proposedMatch.kind) {
      case 'cross':
        leftSide = 'bank';  leftRows = [bankData[proposedMatch.bankIdx]];
        rightSide = 'gl';   rightRows = [glData[proposedMatch.glIdx]];
        kindLabel = 'Penny-perfect Bank ↔ GL match';
        break;
      case 'bank-pair':
        leftSide = 'bank';  leftRows = [bankData[proposedMatch.bankIdx1]];
        rightSide = 'bank'; rightRows = [bankData[proposedMatch.bankIdx2]];
        kindLabel = 'Offsetting Bank ↔ Bank pair';
        break;
      case 'gl-pair':
        leftSide = 'gl';    leftRows = [glData[proposedMatch.glIdx1]];
        rightSide = 'gl';   rightRows = [glData[proposedMatch.glIdx2]];
        kindLabel = 'Offsetting GL ↔ GL pair';
        break;
      case 'cross-one-many':
        leftSide = 'bank';  leftRows = [bankData[proposedMatch.bankIdx]];
        rightSide = 'gl';   rightRows = proposedMatch.glIdxs.map((i) => glData[i]);
        kindLabel = `One Bank ↔ ${proposedMatch.glIdxs.length} GL (sums match)`;
        break;
      case 'cross-many-one':
        leftSide = 'bank';  leftRows = proposedMatch.bankIdxs.map((i) => bankData[i]);
        rightSide = 'gl';   rightRows = [glData[proposedMatch.glIdx]];
        kindLabel = `${proposedMatch.bankIdxs.length} Bank ↔ One GL (sums match)`;
        break;
      case 'many-many':
        leftSide = 'bank';  leftRows = proposedMatch.bankIdxs.map((i) => bankData[i]);
        rightSide = 'gl';   rightRows = proposedMatch.glIdxs.map((i) => glData[i]);
        kindLabel = `${proposedMatch.bankIdxs.length} Bank ↔ ${proposedMatch.glIdxs.length} GL (sums match)`;
        break;
    }
    const sumOf = (rows: (BankRow | GLRow)[]) => rows.reduce((s, r) => s + r.amount, 0);
    const leftSubtotal = sumOf(leftRows);
    const rightSubtotal = sumOf(rightRows);
    const renderRowEntry = (row: BankRow | GLRow, side: 'bank' | 'gl', idx: number) => {
      if (side === 'bank') {
        const r = row as BankRow;
        return (
          <div key={idx} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>{excelSerialToString(r.date)}{r.checkNumber ? ` · #${r.checkNumber}` : ''}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <div style={{ fontSize: '13px', wordBreak: 'break-word' }}>{r.description}</div>
              <div style={{ fontWeight: 600, ...amountStyleInline(r.amount) }}>{formatAmount(r.amount)}</div>
            </div>
          </div>
        );
      }
      const r = row as GLRow;
      return (
        <div key={idx} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>{excelSerialToString(r.date)} · {r.reference} · {r.journal}{r.checkNumber ? ` · #${r.checkNumber}` : ''}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
            <div style={{ fontSize: '13px', wordBreak: 'break-word' }}>{r.memo}</div>
            <div style={{ fontWeight: 600, ...amountStyleInline(r.amount) }}>{formatAmount(r.amount)}</div>
          </div>
        </div>
      );
    };
    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={denyProposedMatch}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
            width: 'min(720px, 92vw)',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>Proposed Match</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                Will assign Match # <strong style={{ color: '#1e40af' }}>{proposedMatch.matchNum}</strong>
              </span>
              <button
                type="button"
                onClick={denyProposedMatch}
                aria-label="Close"
                title="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: '#666',
                  lineHeight: 1,
                }}
              >
                <span className="material-icons" style={{ fontSize: '22px' }}>close</span>
              </button>
            </div>
          </div>
          <p style={{ marginTop: '4px', marginBottom: '18px', color: '#666', fontSize: '13px' }}>
            {kindLabel}. Approve to assign the match number to both rows.
          </p>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', marginBottom: '20px' }}>
            <div style={{ flex: 1, border: '1px solid #d0d0d0', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #e0e0e0', fontWeight: 600 }}>
                {leftSide === 'bank' ? 'Bank' : 'GL'}{leftRows.length > 1 ? ` (${leftRows.length} rows)` : ''}
              </div>
              <div style={{ maxHeight: '40vh', overflow: 'auto', flex: 1 }}>
                {leftRows.map((r, i) => renderRowEntry(r, leftSide, i))}
              </div>
              <div style={{ padding: '8px 12px', borderTop: '1px solid #e0e0e0', background: '#fafafa', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Subtotal</span>
                <span style={amountStyleInline(leftSubtotal)}>{formatAmount(leftSubtotal)}</span>
              </div>
            </div>

            <div style={{ flex: 1, border: '1px solid #d0d0d0', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #e0e0e0', fontWeight: 600 }}>
                {rightSide === 'bank' ? 'Bank' : 'GL'}{rightRows.length > 1 ? ` (${rightRows.length} rows)` : ''}
              </div>
              <div style={{ maxHeight: '40vh', overflow: 'auto', flex: 1 }}>
                {rightRows.map((r, i) => renderRowEntry(r, rightSide, i))}
              </div>
              <div style={{ padding: '8px 12px', borderTop: '1px solid #e0e0e0', background: '#fafafa', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Subtotal</span>
                <span style={amountStyleInline(rightSubtotal)}>{formatAmount(rightSubtotal)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={denyProposedMatch}
              style={{
                background: '#fff',
                color: '#202020',
                border: '1.5px solid #b8b8b8',
                padding: '8px 22px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Deny
            </button>
            <button
              type="button"
              onClick={approveProposedMatch}
              style={{
                background: '#15803d',
                color: '#fff',
                border: '1.5px solid #166534',
                padding: '8px 22px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>check</span>
              Approve
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Match # input cell ───
  const renderMatchCell = (n: number, idx: number, onChange: (idx: number, v: string) => void) => {
    const set = n > 0;
    return (
      <span className={`match-chip ${set ? 'set' : 'none'}`}>
        <input
          type="number"
          value={set ? n : ''}
          placeholder={set ? '' : '—'}
          onChange={(e) => onChange(idx, e.target.value)}
          className={`match-input ${set ? 'matched' : ''}`}
        />
      </span>
    );
  };

  return (
    <div className="bank-gl-page" style={{ marginTop: '12px' }}>
      {/* ─── Status strip: bank vs GL, variance, matched/unmatched, progress ─── */}
      <div className="recon-status">
        <div className="rs-item">
          <span className="rs-k">Bank total</span>
          <span className="rs-v"><Amt value={bankTotal} /></span>
        </div>
        <span className="material-icons rs-arrow" aria-hidden="true">east</span>
        <div className="rs-item">
          <span className="rs-k">GL total</span>
          <span className="rs-v"><Amt value={glTotal} /></span>
        </div>
        <div className="rs-divider" />
        <div className="rs-item">
          <span className="rs-k">Variance</span>
          <span className={`rs-v ${Math.abs(variance) < 0.005 ? 'pos' : 'neg'} mono`}>
            {Math.abs(variance) < 0.005 ? '0.00' : formatAmount(variance)}
          </span>
        </div>
        <div className="rs-divider" />
        <div className="rs-item">
          <span className="rs-k">Matched pairs</span>
          <span className="rs-v mono">{matchedPairs}</span>
        </div>
        <div className="rs-item">
          <span className="rs-k">Unmatched</span>
          <span className="rs-v mono">{totalUnmatched}</span>
        </div>
        <div className="rs-spacer" />
        <div className="rs-progress">
          <div className="rs-bar">
            <i style={{ width: `${progressPct}%` }} />
          </div>
          <span className="rs-pct">{progressPct}%</span>
        </div>
      </div>

      {/* ─── Active filter chip (from Reconciliation tab click-through) ─── */}
      {matchNumFilter !== null && (
        <div className="match-filter-chip">
          <span className="material-icons" aria-hidden="true" style={{ fontSize: '16px' }}>filter_alt</span>
          <span>Showing only Match #&nbsp;<strong>{matchNumFilter}</strong></span>
          <button
            type="button"
            className="clear"
            onClick={() => setMatchNumFilter(null)}
            title="Clear filter"
          >
            <span className="material-icons" aria-hidden="true" style={{ fontSize: '14px' }}>close</span>
            Clear
          </button>
        </div>
      )}

      {/* ─── Toolbar ─── */}
      <div className="recon-toolbar">
        <div className="rt-left">
          <button type="button" className="btn" onClick={handleMatchChecks}>
            <span className="material-icons" aria-hidden="true">tag</span>
            Match Checks
          </button>
          <button type="button" className="btn" onClick={handleAutoMatch}>
            <span className="material-icons" aria-hidden="true">compare_arrows</span>
            Auto Match
          </button>
          <button
            type="button"
            className="btn ai"
            onClick={() => {
              // TODO: auto-reconcile remaining variances by generating recon items
              console.log('Auto Recon — pending implementation');
            }}
          >
            <span className="material-icons" aria-hidden="true">auto_awesome</span>
            Auto Recon
            <span className="ai-shimmer" />
          </button>
          {autoMatchMsg && <span className="rt-msg">{autoMatchMsg}</span>}
        </div>
        <div className="rt-right">
          {isDirty && (
            <span className="dirty-flag">
              <span className="df-dot" />
              <span>Unsaved changes</span>
            </span>
          )}
          <button type="button" className="btn" onClick={handleReset} disabled={!isDirty}>
            <span className="material-icons" aria-hidden="true">undo</span>
            Reset
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            disabled={!isDirty}
          >
            <span className="material-icons" aria-hidden="true">save</span>
            Save
          </button>
        </div>
      </div>

      {/* ─── Bank / GL grid ─── */}
      <div className="recon-grid">
        {/* ── Bank panel ── */}
        <div className="recon-panel">
          <div className="recon-panel-head">
            <div className="rph-title">
              <span className="rph-tag">BANK</span>
              <h3>Bank transactions</h3>
            </div>
            <div className="rph-count">
              <span className="dot pos" /> {bankMatched} matched
              <span className="sep" />
              <span className="dot neg" /> {bankUnmatched} unmatched
            </div>
          </div>
          <div className="recon-panel-totals">
            <div>
              <div className="rt-k">Period total</div>
              <div className="rt-v"><Amt value={bankTotal} /></div>
            </div>
            <div>
              <div className="rt-k">Matched</div>
              <div className="rt-v mono">
                <Amt value={bankData.filter((r) => r.matchNum > 0).reduce((s, r) => s + r.amount, 0)} />
              </div>
            </div>
            <div>
              <div className="rt-k">Unmatched</div>
              <div className="rt-v mono">
                <Amt value={bankData.filter((r) => r.matchNum === 0).reduce((s, r) => s + r.amount, 0)} />
              </div>
            </div>
          </div>
          <div className="recon-table-wrap">
            <table className="recon-table">
              <colgroup>
                <col style={{ width: 88 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 88 }} />
              </colgroup>
              <thead>
                <tr>
                  <SortableHeader label="Date"        field="date"        activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} />
                  <SortableHeader label="Description" field="description" activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} />
                  <SortableHeader label="Check #"     field="checkNumber" activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} />
                  <SortableHeader label="Amount"      field="amount"      activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} align="right" />
                  <SortableHeader label="Bank ID"     field="bankId"      activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} />
                  <SortableHeader label="Match"       field="matchNum"    activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} align="center" />
                  <SortableHeader label="ME"          field="me"          activeField={bankSort.field as string} dir={bankSort.dir} onSort={handleBankSort} />
                </tr>
              </thead>
              <tbody>
                {sortedBank.map((r) => {
                  const dimmed = matchNumFilter !== null && r.matchNum !== matchNumFilter;
                  return (
                    <tr key={r.__idx} className={`${r.matchNum > 0 ? 'matched' : 'unmatched'} ${dimmed ? 'dimmed' : ''}`}>
                      <td className="muted mono">{excelSerialToString(r.date)}</td>
                      <td><div className="desc">{r.description}</div></td>
                      <td className="mono">{r.checkNumber || <span className="faint">—</span>}</td>
                      <td className="r"><Amt value={r.amount} /></td>
                      <td className="mono muted">{r.bankId || <span className="faint">—</span>}</td>
                      <td className="c">{renderMatchCell(r.matchNum, r.__idx, updateBankMatch)}</td>
                      <td className="muted mono">{excelSerialToString(r.me)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── GL panel ── */}
        <div className="recon-panel">
          <div className="recon-panel-head">
            <div className="rph-title">
              <span className="rph-tag gl">GL</span>
              <h3>General ledger</h3>
            </div>
            <div className="rph-count">
              <span className="dot pos" /> {glMatched} matched
              <span className="sep" />
              <span className="dot neg" /> {glUnmatched} unmatched
            </div>
          </div>
          <div className="recon-panel-totals">
            <div>
              <div className="rt-k">Period total</div>
              <div className="rt-v"><Amt value={glTotal} /></div>
            </div>
            <div>
              <div className="rt-k">Matched</div>
              <div className="rt-v mono">
                <Amt value={glData.filter((r) => r.matchNum > 0).reduce((s, r) => s + r.amount, 0)} />
              </div>
            </div>
            <div>
              <div className="rt-k">Unmatched</div>
              <div className="rt-v mono">
                <Amt value={glData.filter((r) => r.matchNum === 0).reduce((s, r) => s + r.amount, 0)} />
              </div>
            </div>
          </div>
          <div className="recon-table-wrap">
            <table className="recon-table">
              <colgroup>
                <col style={{ width: 88 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 88 }} />
              </colgroup>
              <thead>
                <tr>
                  <SortableHeader label="Date"      field="date"        activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} />
                  <SortableHeader label="Memo"      field="memo"        activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} />
                  <SortableHeader label="Reference" field="reference"   activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} />
                  <SortableHeader label="Journal"   field="journal"     activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} />
                  <SortableHeader label="Check #"   field="checkNumber" activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} />
                  <SortableHeader label="Amount"    field="amount"      activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} align="right" />
                  <SortableHeader label="Match"     field="matchNum"    activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} align="center" />
                  <SortableHeader label="ME"        field="me"          activeField={glSort.field as string} dir={glSort.dir} onSort={handleGlSort} />
                </tr>
              </thead>
              <tbody>
                {sortedGL.map((r) => {
                  const dimmed = matchNumFilter !== null && r.matchNum !== matchNumFilter;
                  return (
                    <tr key={r.__idx} className={`${r.matchNum > 0 ? 'matched' : 'unmatched'} ${dimmed ? 'dimmed' : ''}`}>
                      <td className="muted mono">{excelSerialToString(r.date)}</td>
                      <td><div className="desc">{r.memo}</div></td>
                      <td className="mono">{r.reference}</td>
                      <td>{r.journal ? <span className="journal-pill">{r.journal}</span> : <span className="faint">—</span>}</td>
                      <td className="mono">{r.checkNumber || <span className="faint">—</span>}</td>
                      <td className="r"><Amt value={r.amount} /></td>
                      <td className="c">{renderMatchCell(r.matchNum, r.__idx, updateGlMatch)}</td>
                      <td className="muted mono">{excelSerialToString(r.me)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Legend ─── */}
      <div className="recon-legend">
        <div className="rl-group">
          <span><span className="legend-swatch matched-sw" /> Matched row</span>
          <span><span className="legend-swatch unmatched-sw" /> Unmatched row</span>
          <span><span className="legend-swatch chip-sw" /> Match #</span>
        </div>
        <div className="rl-hint">
          Tip · Enter the same Match # on a Bank row and a GL row to pair them, or use Auto Match for penny-perfect pairs.
        </div>
      </div>

      {renderModal()}
    </div>
  );
};

export default BankGL;
