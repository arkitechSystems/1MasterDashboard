/**
 * Prepaid amortization tool. User enters a prepaid invoice
 * (vendor / invoice # / GL expense account / amount / start / end date /
 * fiscal year). The tool spreads the amount evenly across the months
 * inside the chosen fiscal year and emits:
 *
 *   - A table showing the per-month amortization for every row
 *   - An initial JE on Add (Dr Prepaid Asset / Cr AP)
 *   - A monthly JE batch (Dr GL Exp / Cr Prepaid Asset) per row, per
 *     month that has expense activity inside the selected fiscal year
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

const buildMonthly = (
  amount: number,
  startDate: Date,
  endDate: Date,
  year: number,
): Record<string, number> => {
  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth() + 1);
  if (months <= 0) return {};
  const perMonth = amount / months;
  const out: Record<string, number> = {};
  MONTHS.forEach((m) => (out[m] = 0));
  const cursor = new Date(startDate);
  for (let i = 0; i < months; i++) {
    if (cursor.getFullYear() === year) {
      out[MONTHS[cursor.getMonth()]] += perMonth;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
};

const PrepaidsTool: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [vendor, setVendor] = useState('GE Healthcare');
  const [invoice, setInvoice] = useState('INV-1001');
  const [glAcct, setGlAcct] = useState('6100');
  const [prepaidAcct, setPrepaidAcct] = useState('1500');
  const [amount, setAmount] = useState('12000');
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [rows, setRows] = useState<PrepaidRow[]>([]);

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
    const amt = parseFloat(amount);
    if (!vendor || !invoice || !glAcct || !amt || !startDate || !endDate) return;
    const monthly = buildMonthly(amt, new Date(startDate), new Date(endDate), fiscalYear);
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

  const exportExcel = () => {
    const header = ['Vendor', 'Invoice #', 'GL Exp Acct', 'Amount', ...MONTHS.map((m) => `${m} ${fiscalYear}`)];
    const body = visible.map((r) => [
      r.vendor, r.invoice, r.glAcct, r.amount, ...MONTHS.map((m) => r.monthlyByLabel[m] || 0),
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
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
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 48, 87] },
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
        date: r.startDate, account: '2000',
        description: `AP — ${r.vendor} ${r.invoice}`,
        debit: 0, credit: r.amount, reference: r.invoice, memo: r.vendor,
      });
      // 2. Monthly amortization across the fiscal year
      MONTHS.forEach((m, mIdx) => {
        const amt = r.monthlyByLabel[m] || 0;
        if (amt <= 0.005) return;
        const lastDay = new Date(r.fiscalYear, mIdx + 1, 0)
          .toISOString().slice(0, 10);
        lines.push({
          date: lastDay, account: r.glAcct,
          description: `Prepaid amort — ${r.vendor} ${r.invoice}`,
          debit: amt, credit: 0, reference: r.invoice, memo: `${m} ${r.fiscalYear}`,
        });
        lines.push({
          date: lastDay, account: r.prepaidAcct,
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
                <td colSpan={3} className="center">Total</td>
                <td className="num">{fmtMoney(totals.amount)}</td>
                {MONTHS.map((m) => <td key={m} className="num">{fmtMoney(totals[m] || 0)}</td>)}
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
