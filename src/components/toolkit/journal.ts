/**
 * Shared journal-entry types + export helpers used by every tool in the
 * Toolkit. The tools compute their own schedule (prepaid amortization,
 * lease amortization, etc.) and produce a JournalBatch — a flat list of
 * debit/credit lines grouped by entry date. The data-entry clerk takes
 * the resulting CSV / Excel and posts it into the GL system.
 */

import * as XLSX from 'xlsx';

export interface JournalLine {
  date: string;        // YYYY-MM-DD
  account: string;     // GL account number
  description: string;
  debit: number;       // 0 when this is a credit line
  credit: number;      // 0 when this is a debit line
  reference?: string;  // invoice #, lease #, etc. — optional
  memo?: string;
}

export interface JournalBatch {
  title: string;
  lines: JournalLine[];
}

export const fmtMoney = (n: number): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadJournalCsv = (batch: JournalBatch) => {
  const header = ['Date', 'Account', 'Description', 'Debit', 'Credit', 'Reference', 'Memo'];
  const rows = batch.lines.map((l) => [
    l.date,
    l.account,
    l.description,
    l.debit ? l.debit.toFixed(2) : '',
    l.credit ? l.credit.toFixed(2) : '',
    l.reference ?? '',
    l.memo ?? '',
  ]);
  const escape = (s: string | number) => {
    const str = String(s);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  const safeName = batch.title.replace(/[^A-Za-z0-9_-]+/g, '_');
  triggerDownload(new Blob([csv], { type: 'text/csv' }), `${safeName}.csv`);
};

export const downloadJournalXlsx = (batch: JournalBatch) => {
  const header = ['Date', 'Account', 'Description', 'Debit', 'Credit', 'Reference', 'Memo'];
  const rows = batch.lines.map((l) => [
    l.date,
    l.account,
    l.description,
    l.debit || '',
    l.credit || '',
    l.reference ?? '',
    l.memo ?? '',
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Journal Entries');
  const safeName = batch.title.replace(/[^A-Za-z0-9_-]+/g, '_');
  XLSX.writeFile(wb, `${safeName}.xlsx`);
};
