/**
 * Lease amortization tool (ASC 842). Inputs: commencement date, term in
 * months, monthly payment, discount rate, optional description. Produces:
 *
 *   - Amortization schedule with beginning balance, payment, interest,
 *     principal, ending balance, ST liability, LT liability.
 *   - Payment-breakdown bar chart (interest vs principal) via recharts.
 *   - Initial JE (Dr ROU Asset / Cr Lease Liability) at the PV of the
 *     payment stream.
 *   - Monthly JE batch: interest expense, lease-liability reduction, cash
 *     outflow, plus straight-line amortization of the ROU asset.
 */

import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  JournalBatch,
  JournalLine,
  downloadJournalCsv,
  downloadJournalXlsx,
  fmtMoney,
} from './journal';

interface ScheduleRow {
  period: number;
  monthEnd: string;       // YYYY-MM-DD
  begBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
  stLiab: number;
  ltLiab: number;
}

const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

const generateSchedule = (
  startDate: Date,
  termMonths: number,
  monthlyPayment: number,
  annualRatePct: number,
): { rows: ScheduleRow[]; presentValue: number } => {
  const monthlyRate = annualRatePct / 100 / 12;
  // Initial liability = PV of an annuity of monthlyPayment for termMonths
  // at monthlyRate. When rate is 0, PV is just payment * term.
  const pv = monthlyRate === 0
    ? monthlyPayment * termMonths
    : monthlyPayment * (1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate;

  const rows: ScheduleRow[] = [];
  let balance = pv;
  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * monthlyRate;
    let principal = monthlyPayment - interest;
    if (i === termMonths) principal = balance; // squash rounding on the last period
    const endingBalance = +(balance - principal).toFixed(2);

    // ST liab = principal portion of the next 12 months' payments
    const remaining = termMonths - i;
    let stLiab = 0;
    const monthsToInclude = Math.min(12, remaining);
    let lookBalance = endingBalance;
    for (let k = 1; k <= monthsToInclude; k++) {
      const lookInterest = lookBalance * monthlyRate;
      const lookPrincipal = monthlyPayment - lookInterest;
      stLiab += lookPrincipal;
      lookBalance -= lookPrincipal;
    }
    stLiab = Math.min(stLiab, endingBalance);
    const ltLiab = Math.max(endingBalance - stLiab, 0);

    const monthEnd = new Date(startDate);
    monthEnd.setMonth(startDate.getMonth() + i);

    rows.push({
      period: i,
      monthEnd: formatDate(monthEnd),
      begBalance: balance,
      payment: monthlyPayment,
      interest,
      principal,
      endingBalance,
      stLiab,
      ltLiab,
    });
    balance = endingBalance;
  }
  return { rows, presentValue: pv };
};

const LeasesTool: React.FC = () => {
  const [commencement, setCommencement] = useState('2025-01-01');
  const [termMonths, setTermMonths] = useState('60');
  const [monthlyPayment, setMonthlyPayment] = useState('2500');
  const [discountRate, setDiscountRate] = useState('5');
  const [description, setDescription] = useState('MRI Equipment');
  const [rouAcct, setRouAcct] = useState('1700');
  const [liabilityAcct, setLiabilityAcct] = useState('2700');
  const [interestExpAcct, setInterestExpAcct] = useState('7100');
  const [amortExpAcct, setAmortExpAcct] = useState('6800');
  const [cashAcct, setCashAcct] = useState('1000');
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [pv, setPv] = useState(0);

  const handleGenerate = () => {
    const term = parseInt(termMonths, 10);
    const pmt = parseFloat(monthlyPayment);
    const rate = parseFloat(discountRate);
    if (!term || !pmt || isNaN(rate) || !commencement) {
      alert('Please fill all required fields.');
      return;
    }
    const out = generateSchedule(new Date(commencement), term, pmt, rate);
    setSchedule(out.rows);
    setPv(out.presentValue);
  };

  const chartData = useMemo(
    () => schedule?.map((r) => ({
      period: r.period,
      interest: +r.interest.toFixed(2),
      principal: +r.principal.toFixed(2),
    })) ?? [],
    [schedule],
  );

  const exportCSV = () => {
    if (!schedule) return;
    const header = ['Month End', 'Period', 'Beg Balance', 'Payment', 'Interest',
      'Principal', 'Ending Balance', 'ST Liab', 'LT Liab'];
    const rows = schedule.map((r) => [
      r.monthEnd, r.period, r.begBalance.toFixed(2), r.payment.toFixed(2),
      r.interest.toFixed(2), r.principal.toFixed(2), r.endingBalance.toFixed(2),
      r.stLiab.toFixed(2), r.ltLiab.toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Lease_Schedule_${(description || 'lease').replace(/[^A-Za-z0-9]+/g, '_')}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const exportPDF = () => {
    if (!schedule) return;
    const doc = new jsPDF('l', 'pt', 'a4');
    doc.setFontSize(13);
    doc.text(`${description || 'Lease'} Amortization Schedule`, 40, 36);
    autoTable(doc, {
      startY: 56,
      head: [['Month End', 'Period', 'Beg Balance', 'Payment', 'Interest',
        'Principal', 'Ending Balance', 'ST Liab', 'LT Liab']],
      body: schedule.map((r) => [
        r.monthEnd, r.period, fmtMoney(r.begBalance), fmtMoney(r.payment),
        fmtMoney(r.interest), fmtMoney(r.principal), fmtMoney(r.endingBalance),
        fmtMoney(r.stLiab), fmtMoney(r.ltLiab),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 48, 87] },
    });
    doc.save(`Lease_Schedule_${(description || 'lease').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`);
  };

  const generateJournalBatch = (): JournalBatch => {
    if (!schedule) return { title: 'Lease_JE', lines: [] };
    const lines: JournalLine[] = [];
    const monthlyAmort = pv / schedule.length;
    // 1. Initial recognition
    lines.push({
      date: commencement, account: rouAcct,
      description: `ROU Asset — ${description}`,
      debit: pv, credit: 0, reference: description, memo: 'Initial recognition',
    });
    lines.push({
      date: commencement, account: liabilityAcct,
      description: `Lease Liability — ${description}`,
      debit: 0, credit: pv, reference: description, memo: 'Initial recognition',
    });
    // 2. Monthly entries
    for (const r of schedule) {
      // Cash payment: split into interest expense + principal reduction
      lines.push({
        date: r.monthEnd, account: interestExpAcct,
        description: `Lease interest — ${description}`,
        debit: +r.interest.toFixed(2), credit: 0, reference: description,
        memo: `Period ${r.period}`,
      });
      lines.push({
        date: r.monthEnd, account: liabilityAcct,
        description: `Lease liability reduction — ${description}`,
        debit: +r.principal.toFixed(2), credit: 0, reference: description,
        memo: `Period ${r.period}`,
      });
      lines.push({
        date: r.monthEnd, account: cashAcct,
        description: `Lease payment — ${description}`,
        debit: 0, credit: +r.payment.toFixed(2), reference: description,
        memo: `Period ${r.period}`,
      });
      // Straight-line amortization of ROU asset
      lines.push({
        date: r.monthEnd, account: amortExpAcct,
        description: `ROU amortization — ${description}`,
        debit: +monthlyAmort.toFixed(2), credit: 0, reference: description,
        memo: `Period ${r.period}`,
      });
      lines.push({
        date: r.monthEnd, account: rouAcct,
        description: `ROU amortization — ${description}`,
        debit: 0, credit: +monthlyAmort.toFixed(2), reference: description,
        memo: `Period ${r.period}`,
      });
    }
    return {
      title: `Lease_JE_${(description || 'lease').replace(/[^A-Za-z0-9]+/g, '_')}`,
      lines,
    };
  };

  return (
    <div>
      <h2 className="tk-section-title">Lease Amortization Schedule (ASC 842)</h2>

      <form className="tk-form" onSubmit={(e) => { e.preventDefault(); handleGenerate(); }}>
        <div className="tk-field"><label>Commencement Date</label>
          <input type="date" value={commencement} onChange={(e) => setCommencement(e.target.value)} required /></div>
        <div className="tk-field"><label>Lease Term (months)</label>
          <input type="number" value={termMonths} min={1} onChange={(e) => setTermMonths(e.target.value)} required /></div>
        <div className="tk-field"><label>Monthly Payment</label>
          <input type="number" step="0.01" value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)} required /></div>
        <div className="tk-field"><label>Discount Rate (%)</label>
          <input type="number" step="0.01" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} required /></div>
        <div className="tk-field" style={{ gridColumn: 'span 2' }}><label>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      </form>

      <details style={{ marginBottom: 18 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#6c7a87' }}>
          GL accounts (defaults shown — override per chart of accounts)
        </summary>
        <div className="tk-form" style={{ marginTop: 12 }}>
          <div className="tk-field"><label>ROU Asset</label>
            <input value={rouAcct} onChange={(e) => setRouAcct(e.target.value)} /></div>
          <div className="tk-field"><label>Lease Liability</label>
            <input value={liabilityAcct} onChange={(e) => setLiabilityAcct(e.target.value)} /></div>
          <div className="tk-field"><label>Interest Expense</label>
            <input value={interestExpAcct} onChange={(e) => setInterestExpAcct(e.target.value)} /></div>
          <div className="tk-field"><label>Amortization Expense</label>
            <input value={amortExpAcct} onChange={(e) => setAmortExpAcct(e.target.value)} /></div>
          <div className="tk-field"><label>Cash</label>
            <input value={cashAcct} onChange={(e) => setCashAcct(e.target.value)} /></div>
        </div>
      </details>

      <div className="tk-actions">
        <button type="button" className="tk-btn" onClick={handleGenerate}>
          <span className="material-icons">play_arrow</span>Generate Schedule
        </button>
        <button type="button" className="tk-btn tk-btn-ghost" onClick={exportCSV} disabled={!schedule}>
          <span className="material-icons">download</span>Schedule to CSV
        </button>
        <button type="button" className="tk-btn tk-btn-ghost" onClick={exportPDF} disabled={!schedule}>
          <span className="material-icons">picture_as_pdf</span>Schedule to PDF
        </button>
        <button type="button" className="tk-btn" onClick={() => downloadJournalCsv(generateJournalBatch())} disabled={!schedule}>
          <span className="material-icons">receipt_long</span>JE batch (CSV)
        </button>
        <button type="button" className="tk-btn" onClick={() => downloadJournalXlsx(generateJournalBatch())} disabled={!schedule}>
          <span className="material-icons">receipt_long</span>JE batch (Excel)
        </button>
      </div>

      {schedule && (
        <>
          <div style={{ fontSize: 13, color: '#6c7a87', marginBottom: 10 }}>
            <strong>Initial liability (PV of payments):</strong> {fmtMoney(pv)}
            &nbsp;&nbsp;·&nbsp;&nbsp;
            <strong>Term:</strong> {schedule.length} months
            &nbsp;&nbsp;·&nbsp;&nbsp;
            <strong>Total payments:</strong> {fmtMoney(schedule.reduce((s, r) => s + r.payment, 0))}
          </div>
          <div className="tk-table-wrap">
            <table className="tk-table">
              <thead>
                <tr>
                  <th>Month End</th><th>Period</th><th>Beg Balance</th><th>Payment</th>
                  <th>Interest</th><th>Principal</th><th>Ending Balance</th>
                  <th>ST Liab</th><th>LT Liab</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={r.period}>
                    <td className="center">{r.monthEnd}</td>
                    <td className="center">{r.period}</td>
                    <td className="num">{fmtMoney(r.begBalance)}</td>
                    <td className="num">{fmtMoney(r.payment)}</td>
                    <td className="num">{fmtMoney(r.interest)}</td>
                    <td className="num">{fmtMoney(r.principal)}</td>
                    <td className="num">{fmtMoney(r.endingBalance)}</td>
                    <td className="num">{fmtMoney(r.stLiab)}</td>
                    <td className="num">{fmtMoney(r.ltLiab)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="tk-section-title" style={{ marginTop: 6 }}>Payment Breakdown</h3>
          <div className="tk-chart" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e5ebf2" strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="interest" fill="rgba(255,99,132,0.7)" />
                <Bar dataKey="principal" fill="rgba(54,162,235,0.7)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

export default LeasesTool;
