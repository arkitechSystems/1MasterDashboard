import React, { useMemo } from 'react';
import {
  BankRow,
  GLRow,
  MatchRow,
  computeMatches,
  excelSerialToString,
  formatAmount,
} from './data';

interface MatchesProps {
  bankData: BankRow[];
  glData: GLRow[];
}

// Amount span — picks .amt.neg / .amt.pos / .amt.zero so the colors match
// what's used on the Bank/GL tab.
const Amt: React.FC<{ value: number }> = ({ value }) => {
  const cls = value < 0 ? 'neg' : value > 0 ? 'pos' : 'zero';
  return <span className={`amt ${cls}`}>{formatAmount(value)}</span>;
};

const Matches: React.FC<MatchesProps> = ({ bankData, glData }) => {
  const matches: MatchRow[] = useMemo(() => computeMatches(bankData, glData), [bankData, glData]);

  const totals = useMemo(() => ({
    bankAmt: matches.reduce((s, m) => s + m.bankAmt, 0),
    glAmt: matches.reduce((s, m) => s + m.glAmt, 0),
    variance: matches.reduce((s, m) => s + m.variance, 0),
  }), [matches]);

  return (
    <div className="matches-subpage" style={{ marginTop: '12px' }}>
      <div className="recon-panel">
        <div className="recon-panel-head">
          <div className="rph-title">
            <span className="rph-tag">MATCHES</span>
            <h2>Bank ↔ GL aggregation by Match #</h2>
          </div>
          <span className="rph-sub">Variance = Bank − GL</span>
        </div>

        <div className="recon-table-wrap">
          <table className="recon-table">
            <thead>
              <tr className="group-row">
                <th className="r" rowSpan={2}>Match #</th>
                <th rowSpan={2}>Description</th>
                <th className="c" colSpan={4}>Bank</th>
                <th className="c gb" colSpan={4}>GL</th>
                <th className="r gb" rowSpan={2}>Variance</th>
                <th className="c gb" rowSpan={2}>Month Match</th>
              </tr>
              <tr className="sub-row">
                <th className="r">Amt</th>
                <th>Desc</th>
                <th>Month</th>
                <th className="r">Count</th>
                <th className="r gb">Amt</th>
                <th>Desc</th>
                <th>Month</th>
                <th className="r">Count</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const ties = m.variance === 0 && (m.bankCount > 0 || m.glCount > 0);
                const varianceClass = m.variance === 0 ? 'pos' : 'neg';
                return (
                  <tr key={m.matchNum}>
                    <td className="r mono">{m.matchNum}</td>
                    <td className="desc">{m.description}</td>
                    <td className="r"><Amt value={m.bankAmt} /></td>
                    <td>{m.bankDesc}</td>
                    <td className="mono muted">{m.bankMonth ? excelSerialToString(m.bankMonth) : <span className="faint">—</span>}</td>
                    <td className="r mono">{m.bankCount}</td>
                    <td className="r gb"><Amt value={m.glAmt} /></td>
                    <td>{m.glDesc}</td>
                    <td className="mono muted">{m.glMonth ? excelSerialToString(m.glMonth) : <span className="faint">—</span>}</td>
                    <td className="r mono">{m.glCount}</td>
                    <td className={`r gb mono ${varianceClass === 'pos' ? '' : 'amt neg'}`} style={varianceClass === 'pos' ? { color: 'var(--pos)' } : undefined}>
                      {formatAmount(m.variance)}
                    </td>
                    <td className="c gb mono" style={{ color: m.monthMatch === 'Y' ? 'var(--pos)' : 'var(--faint)', fontWeight: 600 }}>
                      {ties ? m.monthMatch : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="r"><Amt value={totals.bankAmt} /></td>
                <td colSpan={3} />
                <td className="r gb"><Amt value={totals.glAmt} /></td>
                <td colSpan={3} />
                <td className="r gb" style={{ color: totals.variance === 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {formatAmount(totals.variance)}
                </td>
                <td className="c gb" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Matches;
