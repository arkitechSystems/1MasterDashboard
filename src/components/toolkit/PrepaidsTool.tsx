/**
 * Prepaid amortization tool. User enters a prepaid invoice
 * (vendor / invoice # / GL expense account / amount / start / end date /
 * fiscal year). The tool spreads the amount evenly across the months
 * inside the chosen fiscal year and emits:
 *
 *   - A table showing the per-month amortization for every row
 *   - An EOM Prepaid Balance row at the bottom that ties to the GL —
 *     the unamortized portion sitting in the prepaid asset at the end
 *     of each month
 *   - An initial JE on Add (Dr Prepaid Asset / Cr AP)
 *   - A monthly JE batch (Dr GL Exp / Cr Prepaid Asset) per row, per
 *     month that has expense activity inside the selected fiscal year
 *
 * All date math runs through dateUtils so timezone parsing and short
 * months (Feb-skip on Jan-31 starts) can't bite the amortization.
 *
 * Persists to localStorage so the data clerk can come back to it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  JournalBatch,
  JournalLine,
  downloadJournalCsv,
  downloadJournalXlsx,
  fmtMoney,
} from './journal';
import {
  parseYMD,
  addMonths,
  monthsInclusive,
  monthEndStr,
  YMD,
} from './dateUtils';

interface PrepaidRow {
  vendor: string;
  invoice: string;
  glAcct: string;            // expense GL account
  prepaidAcct: string;       // prepaid asset GL (default 1500)
  amount: number;
  startDate: string;         // YYYY-MM-DD
  endDate: string;
  fiscalYear: number;
  monthlyByLabel: Record<string, number>; // 'Jan' → amt
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STORAGE_KEY = 'toolkit_prepaid_rows';

/**
 * Spread an invoice amount evenly across every month from start to end,
 * then return only the months that land inside the selected fiscal year.
 * Returns null when the date inputs are unparseable or the range is
 * non-positive.
 */
const buildMonthly = (
  amount: number,
  startStr: string,
  endStr: string,
  fiscalYear: number,
): Record<string, number> | null => {
  const start = parseYMD(startStr);
  const end = parseYMD(endStr);
  if (!start || !end) return null;
  const totalMonths = monthsInclusive(start, end);
  if (totalMonths <= 0) return null;
  const perMonth = amount / totalMonths;
  const out: Record<string, number> = {};
  MONTHS.forEach((m) => (out[m] = 0));
  let cur: YMD = start;
  for (let i = 0; i < totalMonths; i++) {
    if (cur.y === fiscalYear) {
      out[MONTHS[cur.m]] += perMonth;
    }
    cur = addMonths(cur, 1);
  }
  return out;
};

/**
 * Unamortized balance for a single row at the end of (year, monthIdx).
 * Logic:
 *   - 0 if the invoice hasn't started yet
 *   - 0 once fully amortized (last month done)
 *   - amount − (months elapsed × monthly amortization), where "elapsed"
 *     is the inclusive count from start through (year, monthIdx).
 *
 * The book-keeping mental model: on the start date the full amount is
 * posted to the prepaid asset; each month-end one month of amortization
 * moves from the asset to the expense account. The end-of-start-month
 * balance is therefore amount − one month.
 */
const unamortizedAt = (r: PrepaidRow, year: number, monthIdx: number): number => {
  const start = parseYMD(r.startDate);
  const end = parseYMD(r.endDate);
  if (!start || !end) return 0;
  const totalMonths = monthsInclusive(start, end);
  if (totalMonths <= 0) return 0;
  const perMonth = r.amount / totalMonths;
  const cur: YMD = { y: year, m: monthIdx, d: 1 };
  const elapsed = monthsInclusive(start, cur);
  if (elapsed <= 0) return 0;
  if (elapsed >= totalMonths) return 0;
  return r.amount - elapsed * perMonth;
};

const PrepaidsTool: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [vendor, setVendor] = useState('GE Healthcare');
  const [invoice, setInvoice] = useState('INV-1001');
  const [glAcct, setGlAcct] = useState('6100');
  const [prepaidAcct, setPrepaidAcct] = useState('1500');
  const [apAcct, setApAcct] = useState('2000');
  const [amount, setAmount] = useState('12000');
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [rows, setRows] = useState<PrepaidRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRows(JSON.parse(raw));
    } catch { /* ignore corrupted storage */ }
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = 2020; y <= currentYear + 1; y++) out.push(y);
    return out;
  }, [currentYear]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!vendor || !invoice || !glAcct || !amt) {
      setError('Vendor, invoice #, GL account, and amount are required.');
      return;
    }
    const monthly = buildMonthly(amt, startDate, endDate, fiscalYear);
    if (monthly === null) {
      setError('Start and end dates are required, and end must be on or after start.');
      return;
    }
    setRows((prev) => [
      ...prev,
      { vendor, invoice, glAcct, prepaidAcct, amount: amt, startDate, endDate,
        fiscalYear, monthlyByLabel: monthly },
    ]);
  };

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const visible = rows.filter((r) => r.fiscalYear === fiscalYear);
  const totals = useMemo(() => {
    const t: Record<string, number> = { amount: 0 };
    MONTHS.forEach((m) => (t[m] = 0));
    for (const r of visible) {
      t.amount += r.amount;
      MONTHS.forEach((m) => (t[m] += r.monthlyByLabel[m] || 0));
    }
    return t;
  }, [visible]);

  // EOM Prepaid Asset Balance for the GL — the unamortized portion that
  // should be sitting in the prepaid account at the end of each month.
  const eomBalance = useMemo(() => {
    const out: Record<string, number> = {};
    MONTHS.forEach((m, mIdx) => {
      out[m] = visible.reduce((sum, r) => sum + unamortizedAt(r, fiscalYear, mIdx), 0);
    });
    return out;
  }, [visible, fiscalYear]);

  const exportExcel = () => {
    const header = ['Vendor', 'Invoice #', 'GL Exp Acct', 'Amount', ...MONTHS.map((m) => `${m} ${fiscalYear}`)];
    const body = visible.map((r) => [
      r.vendor, r.invoice, r.glAcct, r.amount, ...MONTHS.map((m) => r.monthlyByLabel[m] || 0),
    ]);
    const totalRow = ['Total', '', '', totals.amount, ...MONTHS.map((m) => totals[m] || 0)];
    const balanceRow = ['Prepaid Balance EOM', '', '', '', ...MONTHS.map((m) => eomBalance[m] || 0)];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...body, totalRow, balanceRow]);
    XLSX.utils.book_append_sheet(wb, ws, 'Prepaid Schedule');
    XLSX.writeFile(wb, `Prepaid_Schedule_${fiscalYear}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'pt', 'a4');
    doc.setFontSize(13);
    doc.text(`Prepaid Amortization Schedule — FY ${fiscalYear}`, 40, 36);
    autoTable(doc, {
      startY: 56,
      head: [['Vendor', 'Invoice #', 'GL', 'Amount', ...MONTHS]],
      body: visible.map((r) => [
        r.vendor, r.invoice, r.glAcct, fmtMoney(r.amount),
        ...MONTHS.map((m) => fmtMoney(r.monthlyByLabel[m] || 0)),
      ]),
      foot: [
        ['Total', '', '', fmtMoney(totals.amount), ...MONTHS.map((m) => fmtMoney(totals[m] || 0))],
        ['Prepaid Balance EOM', '', '', '', ...MONTHS.map((m) => fmtMoney(eomBalance[m] || 0))],
      ],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 48, 87] },
      footStyles: { fillColor: [240, 244, 250], textColor: 30, fontStyle: 'bold' },
    });
    doc.save(`Prepaid_Schedule_${fiscalYear}.pdf`);
  };

  const generateJournalBatch = (): JournalBatch => {
    const lines: JournalLine[] = [];
    for (const r of visible) {
      // 1. Initial recognition on the invoice start date
      lines.push({
        date: r.startDate, account: r.prepaidAcct,
        description: `Prepaid — ${r.vendor} ${r.invoice}`,
        debit: r.amount, credit: 0, reference: r.invoice, memo: r.vendor,
      });
      lines.push({
        date: r.startDate, account: apAcct,
        description: `AP — ${r.vendor} ${r.invoice}`,
        debit: 0, credit: r.amount, reference: r.invoice, memo: r.vendor,
      });
      // 2. Monthly amortization across the fiscal year
      MONTHS.forEach((m, mIdx) => {
        const amt = r.monthlyByLabel[m] || 0;
        if (amt <= 0.005) return;
        const date = monthEndStr(r.fiscalYear, mIdx);
        lines.push({
          date, account: r.glAcct,
          description: `Prepaid amort — ${r.vendor} ${r.invoice}`,
          debit: amt, credit: 0, reference: r.invoice, memo: `${m} ${r.fiscalYear}`,
        });
        lines.push({
          date, account: r.prepaidAcct,
          description: `Prepaid amort — ${r.vendor} ${r.invoice}`,
          debit: 0, credit: amt, reference: r.invoice, memo: `${m} ${r.fiscalYear}`,
        });
      });
    }
    return { title: `Prepaid_JE_FY${fiscalYear}`, lines };
  };

  return (
    <div>
      <h2 className="tk-section-title">Prepaid Amortization Schedule</h2>

      <div className="tk-field" style={{ maxWidth: 200, marginBottom: 12 }}>
        <label htmlFor="prep-fy">Fiscal year</label>
        <select id="prep-fy" value={fiscalYear} onChange={(e) => setFiscalYear(parseInt(e.target.value, 10))}>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <form className="tk-form" onSubmit={handleSubmit}>
        <div className="tk-field"><label>Vendor</label>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} required /></div>
        <div className="tk-field"><label>Invoice #</label>
          <input value={invoice} onChange={(e) => setInvoice(e.target.value)} required /></div>
        <div className="tk-field"><label>GL Exp Acct</label>
          <input value={glAcct} onChange={(e) => setGlAcct(e.target.value)} required /></div>
        <div className="tk-field"><label>Prepaid Acct</label>
          <input value={prepaidAcct} onChange={(e) => setPrepaidAcct(e.target.value)} required /></div>
        <div className="tk-field"><label>AP Acct</label>
          <input value={apAcct} onChange={(e) => setApAcct(e.target.value)} required /></div>
        <div className="tk-field"><label>Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="tk-field"><label>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
        <div className="tk-field"><label>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
        <button type="submit" className="tk-btn">
          <span className="material-icons">add</span>Add
        </button>
      </form>

      {error && (
        <div style={{
          background: '#fdecea', color: '#b91c1c', border: '1px solid #f5c6c0',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      <div className="tk-actions">
        <button type="button" className="tk-btn tk-btn-ghost" onClick={exportExcel} disabled={visible.length === 0}>
          <span className="material-icons">download</span>Schedule to Excel
        </button>
        <button type="button" className="tk-btn tk-btn-ghost" onClick={exportPDF} disabled={visible.length === 0}>
          <span className="material-icons">picture_as_pdf</span>Schedule to PDF
        </button>
        <button type="button" className="tk-btn" onClick={() => downloadJournalCsv(generateJournalBatch())} disabled={visible.length === 0}>
          <span className="material-icons">receipt_long</span>JE batch (CSV)
        </button>
        <button type="button" className="tk-btn" onClick={() => downloadJournalXlsx(generateJournalBatch())} disabled={visible.length === 0}>
          <span className="material-icons">receipt_long</span>JE batch (Excel)
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="tk-empty">No prepaid rows for FY {fiscalYear}. Add one above.</div>
      ) : (
        <div className="tk-table-wrap">
          <table className="tk-table">
            <thead>
              <tr>
                <th>Vendor</th><th>Invoice #</th><th>GL Exp</th><th>Amount</th>
                {MONTHS.map((m) => <th key={m}>{m} {fiscalYear}</th>)}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={i}>
                  <td>{r.vendor}</td>
                  <td>{r.invoice}</td>
                  <td className="center">{r.glAcct}</td>
                  <td className="num">{fmtMoney(r.amount)}</td>
                  {MONTHS.map((m) => (
                    <td key={m} className="num">{fmtMoney(r.monthlyByLabel[m] || 0)}</td>
                  ))}
                  <td className="center">
                    <button type="button" className="tk-row-btn" onClick={() => removeRow(rows.indexOf(r))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="center">Total Activity</td>
                <td className="num">{fmtMoney(totals.amount)}</td>
                {MONTHS.map((m) => <td key={m} className="num">{fmtMoney(totals[m] || 0)}</td>)}
                <td />
              </tr>
              <tr title="Unamortized prepaid asset balance at end of month — ties to the GL prepaid account.">
                <td colSpan={4} className="center">Prepaid Balance EOM</td>
                {MONTHS.map((m) => <td key={m} className="num">{fmtMoney(eomBalance[m] || 0)}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default PrepaidsTool;
