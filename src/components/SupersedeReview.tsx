/**
 * Supersede review panel. Shown after a GL merge when the server found
 * pairs where a freshly-inserted row LOOKS like the corrected version
 * of an existing row (same account+date+amount, different memo/journal/
 * reference/description).
 *
 * The user marks individual pairs (or all) as supersedes — that sets
 * gl_detail.superseded_by on the old row so it stops counting as
 * "current" while the audit trail is preserved.
 */

import React, { useMemo, useState } from 'react';
import {
  SupersedeCandidate,
  SupersedePair,
  applySupersedes,
} from '../services/setupApi';

interface SupersedeReviewProps {
  candidates: SupersedeCandidate[];
  /** Called after the user finishes (skip + saved). Parent can clear state. */
  onClose: () => void;
}

type Decision = 'mark' | 'keep';

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

const SupersedeReview: React.FC<SupersedeReviewProps> = ({ candidates, onClose }) => {
  const [decisions, setDecisions] = useState<Map<string, Decision>>(
    () => new Map(candidates.map((c) => [c.oldRow.txId + '|' + c.newRow.txId, 'mark'])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = (c: SupersedeCandidate) => c.oldRow.txId + '|' + c.newRow.txId;
  const setOne = (c: SupersedeCandidate, d: Decision) =>
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(key(c), d);
      return next;
    });
  const bulk = (d: Decision) =>
    setDecisions(new Map(candidates.map((c) => [key(c), d])));

  const markedCount = useMemo(
    () => Array.from(decisions.values()).filter((d) => d === 'mark').length,
    [decisions],
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const pairs: SupersedePair[] = candidates
        .filter((c) => decisions.get(key(c)) === 'mark')
        .map((c) => ({ oldTxId: c.oldRow.txId, newTxId: c.newRow.txId }));
      if (pairs.length > 0) {
        await applySupersedes(pairs);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save supersedes');
    } finally {
      setSaving(false);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid #f8b600',
        background: '#fffbeb',
        fontSize: 13,
        color: '#1a2533',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <strong>{candidates.length} potential replacement{candidates.length === 1 ? '' : 's'} found.</strong>
          <div style={{ color: '#6c7a87', marginTop: 4 }}>
            Each pair below shares the same account, date, and amount but differs on
            other fields. If a pair represents the same real transaction (e.g. you
            re-uploaded after fixing a memo typo), mark the older row as superseded
            so it stops counting as a current GL entry. The old row stays in the
            database for audit history.
          </div>
        </div>
        <div style={{ whiteSpace: 'nowrap', marginLeft: 12 }}>
          <button
            type="button"
            onClick={() => bulk('mark')}
            style={btnGhost}
          >
            Mark all
          </button>
          <button
            type="button"
            onClick={() => bulk('keep')}
            style={{ ...btnGhost, marginLeft: 6 }}
          >
            Keep all separate
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderTop: '1px solid #f5d99b', marginBottom: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#fef3c7' }}>
              <th style={th}>Decision</th>
              <th style={th}>Account</th>
              <th style={th}>Date</th>
              <th style={th}>Amount</th>
              <th style={th}>Memo</th>
              <th style={th}>Reference</th>
              <th style={th}>Journal</th>
              <th style={th}>Description</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const d = decisions.get(key(c)) ?? 'mark';
              const diff = (a: string, b: string) =>
                a === b ? td : { ...td, background: '#fef3c7', fontWeight: 600 };
              return (
                <React.Fragment key={key(c)}>
                  <tr style={{ background: '#fff' }}>
                    <td rowSpan={2} style={{ ...td, verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={radioLabel}>
                          <input
                            type="radio"
                            checked={d === 'mark'}
                            onChange={() => setOne(c, 'mark')}
                          />
                          <span>Mark old as superseded</span>
                        </label>
                        <label style={radioLabel}>
                          <input
                            type="radio"
                            checked={d === 'keep'}
                            onChange={() => setOne(c, 'keep')}
                          />
                          <span>Keep separate</span>
                        </label>
                      </div>
                    </td>
                    <td style={tdMono}>{c.oldRow.account}</td>
                    <td style={tdMono}>{c.oldRow.date}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(c.oldRow.amount)}</td>
                    <td style={diff(c.oldRow.memo, c.newRow.memo)}>{c.oldRow.memo || '—'}</td>
                    <td style={diff(c.oldRow.reference, c.newRow.reference)}>{c.oldRow.reference || '—'}</td>
                    <td style={diff(c.oldRow.journal, c.newRow.journal)}>{c.oldRow.journal || '—'}</td>
                    <td style={diff(c.oldRow.description, c.newRow.description)}>{c.oldRow.description || '—'}</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={tdMono}>{c.newRow.account}</td>
                    <td style={tdMono}>{c.newRow.date}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(c.newRow.amount)}</td>
                    <td style={diff(c.oldRow.memo, c.newRow.memo)}>{c.newRow.memo || '—'}</td>
                    <td style={diff(c.oldRow.reference, c.newRow.reference)}>{c.newRow.reference || '—'}</td>
                    <td style={diff(c.oldRow.journal, c.newRow.journal)}>{c.newRow.journal || '—'}</td>
                    <td style={diff(c.oldRow.description, c.newRow.description)}>{c.newRow.description || '—'}</td>
                  </tr>
                  <tr><td colSpan={8} style={{ borderBottom: '2px solid #f5d99b', padding: 0 }} /></tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={{
          background: '#fdecea', color: '#b91c1c', border: '1px solid #f5c6c0',
          padding: '6px 10px', borderRadius: 4, fontSize: 12, marginBottom: 8,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={btnGhost}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={btnPrimary}
        >
          {saving
            ? 'Saving…'
            : `Confirm — mark ${markedCount} as superseded`}
        </button>
      </div>
    </div>
  );
};

const th: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#6c7a87',
  borderBottom: '1px solid #f5d99b',
};
const td: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #f5d99b',
};
const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
const radioLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
const btnGhost: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#1a2533',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnPrimary: React.CSSProperties = {
  ...btnGhost,
  background: '#003057',
  borderColor: '#003057',
  color: '#fff',
  fontWeight: 600,
};

export default SupersedeReview;
