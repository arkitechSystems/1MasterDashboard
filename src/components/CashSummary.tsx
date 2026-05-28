import React, { useMemo, useState } from 'react';
import './CashSummary.css';

interface CashAccount {
  gl: string;
  description: string;
  category: string;
  bank: string;
  acct: string;
  glBalance: number | null;
  bankBalance: number | null;
}

const INITIAL_ROWS: CashAccount[] = [
  { gl: '13000020', description: 'DEPOSIT ACCT 004',          category: 'Cash and Cash Equivalents', bank: 'Bank Of America', acct: '', glBalance: null, bankBalance: null },
  { gl: '13000021', description: 'TB SECOND CASH GL',         category: 'Cash and Cash Equivalents', bank: 'GL Only',         acct: '', glBalance: null, bankBalance: null },
  { gl: '13000022', description: 'Partners Bank',             category: 'Cash and Cash Equivalents', bank: 'Partners Bank',   acct: '', glBalance: null, bankBalance: null },
  { gl: '13000040', description: 'P/R DISB -5/3RD BANK',      category: 'Cash and Cash Equivalents', bank: '',                acct: '', glBalance: null, bankBalance: null },
  { gl: '13000050', description: 'A/P DISB -WACHOVIA',        category: 'Cash and Cash Equivalents', bank: '',                acct: '', glBalance: null, bankBalance: null },
  { gl: '13000061', description: 'PETTY CASH FUND #001',      category: 'Cash and Cash Equivalents', bank: 'Petty Cash',      acct: '', glBalance: null, bankBalance: null },
  { gl: '14000000', description: 'CLINIC DEPOSITORY ACCOUNT', category: 'Cash and Cash Equivalents', bank: 'US Bank',         acct: '', glBalance: null, bankBalance: null },
  { gl: '14000001', description: 'MARIANNA CLINIC CASH',      category: 'Cash and Cash Equivalents', bank: 'US Bank',         acct: '', glBalance: null, bankBalance: null },
  { gl: '14000022', description: 'PARTNERS BANK - CLINIC',    category: 'Cash and Cash Equivalents', bank: '',                acct: '', glBalance: null, bankBalance: null },
];

const fmtAmt = (n: number | null): string => {
  if (n === null || n === undefined) return '';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y}`;
};

const CashSummary: React.FC = () => {
  const [orgName] = useState('HELENA REGIONAL MEDICAL CENTER');
  const [asOfDate, setAsOfDate] = useState('2026-04-30');
  const [rows, setRows] = useState<CashAccount[]>(INITIAL_ROWS);

  const updateCell = <K extends keyof CashAccount>(idx: number, key: K, value: CashAccount[K]) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const totals = useMemo(() => {
    const sum = (key: 'glBalance' | 'bankBalance') =>
      rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
    return { gl: sum('glBalance'), bank: sum('bankBalance') };
  }, [rows]);

  const handlePrint = () => window.print();

  return (
    <div className="cash-summary">
      <div className="cs-toolbar">
        <h1 className="cs-page-title">Cash Summary</h1>
        <div className="cs-toolbar-right">
          <label className="cs-date-field">
            <span>As of</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </label>
          <button className="cs-btn" onClick={handlePrint} title="Print">
            <span className="material-icons">print</span>
            <span>Print</span>
          </button>
        </div>
      </div>

      <div className="cs-report">
        <div className="cs-report-header">
          <div className="cs-org">{orgName}</div>
          <div className="cs-title">Cash Summary</div>
          <div className="cs-asof">{formatDate(asOfDate)}</div>
        </div>

        <table className="cs-table">
          <thead>
            <tr>
              <th>GL</th>
              <th>GL Description</th>
              <th>Balance Sheet Category</th>
              <th>Bank</th>
              <th>Act#</th>
              <th className="num">GL Balance</th>
              <th className="num">Bank Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.gl}>
                <td className="mono">{r.gl}</td>
                <td>{r.description}</td>
                <td>{r.category}</td>
                <td>{r.bank}</td>
                <td>
                  <input
                    className="cs-input"
                    type="text"
                    value={r.acct}
                    onChange={(e) => updateCell(i, 'acct', e.target.value)}
                    placeholder="—"
                  />
                </td>
                <td className="num">
                  <input
                    className="cs-input num"
                    type="number"
                    step="0.01"
                    value={r.glBalance ?? ''}
                    onChange={(e) =>
                      updateCell(i, 'glBalance', e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </td>
                <td className="num">
                  <input
                    className="cs-input num"
                    type="number"
                    step="0.01"
                    value={r.bankBalance ?? ''}
                    onChange={(e) =>
                      updateCell(i, 'bankBalance', e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="cs-total-label">Total</td>
              <td className="num cs-total">{fmtAmt(totals.gl)}</td>
              <td className="num cs-total">{fmtAmt(totals.bank)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default CashSummary;
