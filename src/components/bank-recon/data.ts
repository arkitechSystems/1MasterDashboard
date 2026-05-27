// Shared types, sample data, and helpers for the bank reconciliation feature.
// Mirrors Reference/Example Bank Recon.xlsm (Bank and GL sheets).

export interface BankRow {
  date: number;
  description: string;
  comments: string;
  checkNumber: string;
  amount: number;
  bankId: string;
  matchNum: number;
  me: number;
}

export interface GLRow {
  date: number;
  memo: string;
  reference: string;
  journal: string;
  checkNumber: string;
  amount: number;
  matchNum: number;
  me: number;
}

export const INITIAL_BANK_DATA: BankRow[] = [
  { date: 45992, description: 'Paper Statement Fee',           comments: '', checkNumber: '', amount: -5,    bankId: '', matchNum: 1, me: 46022 },
  { date: 45994, description: 'Service Charge Refund Per Scot', comments: '', checkNumber: '', amount:  5,    bankId: '', matchNum: 2, me: 46022 },
  { date: 46024, description: 'BCN Micro Beacon Disc PymtCCD',  comments: '', checkNumber: '', amount:  0.09, bankId: '', matchNum: 3, me: 46053 },
  { date: 46024, description: 'BCN Micro Beacon Disc PymtCCD',  comments: '', checkNumber: '', amount:  0.08, bankId: '', matchNum: 4, me: 46053 },
  { date: 46024, description: 'Transfer from XXX1569 to XXX18', comments: '', checkNumber: '', amount: 10000, bankId: '', matchNum: 5, me: 46053 },
];

export const INITIAL_GL_DATA: GLRow[] = [
  { date: 46142, memo: 'Transfer from XXX1569 to XXX18',     reference: 'JE203',  journal: 'JE', checkNumber: '', amount:  10000, matchNum: 0, me: 46142 },
  { date: 46142, memo: 'Paper Statement Fee',                 reference: 'JE138',  journal: 'JE', checkNumber: '', amount:     -5, matchNum: 1, me: 46142 },
  { date: 46142, memo: 'Service Charge Refund Per Scot',      reference: 'JE138',  journal: 'JE', checkNumber: '', amount:      5, matchNum: 2, me: 46142 },
  { date: 46142, memo: 'BCN Micro Beacon Disc PymtCCD',       reference: 'JE138',  journal: 'JE', checkNumber: '', amount:   0.09, matchNum: 3, me: 46142 },
  { date: 46142, memo: 'BCN Micro Beacon Disc PymtCCD',       reference: 'JE138',  journal: 'JE', checkNumber: '', amount:   0.08, matchNum: 4, me: 46142 },
  { date: 46142, memo: 'Transfer from XXX1569 to XXX18',      reference: 'JE138',  journal: 'JE', checkNumber: '', amount:  10000, matchNum: 5, me: 46142 },
  { date: 46142, memo: 'Transfer from XXX1569 to XXX18',      reference: 'JE203R', journal: 'JE', checkNumber: '', amount: -10000, matchNum: 0, me: 46142 },
];

const EXCEL_EPOCH = new Date(1899, 11, 30).getTime();

export const excelSerialToString = (serial: number | null | undefined): string => {
  if (!serial) return '';
  const d = new Date(EXCEL_EPOCH + serial * 86400000);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const excelSerialToMonthYear = (serial: number | null | undefined): string => {
  if (!serial) return '';
  const d = new Date(EXCEL_EPOCH + serial * 86400000);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

export const formatAmount = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '';
  if (amount === 0) return '-';
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `(${abs})` : abs;
};

export const amountColor = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || amount === 0) return '#111';
  return amount < 0 ? '#b91c1c' : '#111';
};

// ─── Balances (month-end roll-forward) ───
// Mirrors the "Balances" sheet of the example recon workbook.

export interface BalanceRow {
  me: number;
  glBalance: number | null;
  glActivityPerTab: number;
  glRollFwd: number | null;
  glVariance: number | null;
  bankBalance: number | null;
  bankActivity: number;
  bankRollFwd: number | null;
  bankVariance: number | null;
  glVsBank: number;
}

export const BALANCES_DATA: BalanceRow[] = [
  { me: 45930, glBalance: null,     glActivityPerTab: 0, glRollFwd: null,     glVariance: null,    bankBalance: null,     bankActivity: 0,        bankRollFwd: null,     bankVariance: null,    glVsBank: 0 },
  { me: 45961, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: 0,        bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
  { me: 45991, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: 0,        bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
  { me: 46022, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: 0,        bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
  { me: 46053, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: 10000.17, bankActivity: 10000.17, bankRollFwd: 10000.17, bankVariance: 0,       glVsBank: -10000.17 },
  { me: 46081, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: 10000.17, bankActivity: 0,        bankRollFwd: 10000.17, bankVariance: 0,       glVsBank: -10000.17 },
  { me: 46112, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: 10000.17, bankActivity: 0,        bankRollFwd: 10000.17, bankVariance: 0,       glVsBank: -10000.17 },
  { me: 46142, glBalance: 10000.17, glActivityPerTab: 10000.17, glRollFwd: 10000.17, glVariance: 0, bankBalance: 10000.17, bankActivity: 0,        bankRollFwd: 10000.17, bankVariance: 0,       glVsBank: 0 },
  { me: 46173, glBalance: null,     glActivityPerTab: 0, glRollFwd: -10000.17, glVariance: 10000.17, bankBalance: null,    bankActivity: 0,        bankRollFwd: 10000.17, bankVariance: -10000.17, glVsBank: 0 },
  { me: 46203, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: null,     bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
  { me: 46234, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: null,     bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
  { me: 46265, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: null,     bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
  { me: 46295, glBalance: null,     glActivityPerTab: 0, glRollFwd: 0,        glVariance: 0,       bankBalance: null,     bankActivity: 0,        bankRollFwd: 0,        bankVariance: 0,       glVsBank: 0 },
];

// ─── Bank statement attachments ───
// Files attached to each month-end (Bank PDF and Bank Excel). Kept in memory
// only for now; later this becomes a server-backed blob store.

export interface AttachedFile {
  name: string;
  blob: Blob;
}

export type AttachmentMap = Record<number, AttachedFile | undefined>;

// ─── Matches aggregation ───
// Replicates the SUMIF/COUNTIF logic from the Matches sheet:
// for each distinct match number, sum bank + gl amounts and compare.

export interface MatchRow {
  matchNum: number;
  description: string;
  bankAmt: number;
  bankDesc: string;
  bankMonth: number | null;
  bankCount: number;
  glAmt: number;
  glDesc: string;
  glMonth: number | null;
  glCount: number;
  variance: number;          // Bank Amt − GL Amt; 0 means the match ties
  monthMatch: 'Y' | 'N';     // Y when Bank Month equals GL Month
}

export const computeMatches = (bank: BankRow[], gl: GLRow[]): MatchRow[] => {
  const matchNums = new Set<number>();
  bank.forEach((r) => matchNums.add(r.matchNum));
  gl.forEach((r) => matchNums.add(r.matchNum));

  return Array.from(matchNums)
    .sort((a, b) => a - b)
    .map((num) => {
      const bankRows = bank.filter((r) => r.matchNum === num);
      const glRows = gl.filter((r) => r.matchNum === num);

      const bankAmt = bankRows.reduce((s, r) => s + r.amount, 0);
      const glAmt = glRows.reduce((s, r) => s + r.amount, 0);
      const bankDesc = bankRows[0]?.description ?? '';
      const glDesc = glRows[0]?.memo ?? '';
      const bankMonth = bankRows[0]?.me ?? null;
      const glMonth = glRows[0]?.me ?? null;

      const description = num === 0
        ? 'Unreconciled Activity'
        : `${bankDesc}${glDesc && bankDesc !== glDesc ? ` | ${glDesc}` : ''}` || glDesc;

      const variance = +(bankAmt - glAmt).toFixed(2);
      const monthMatch: 'Y' | 'N' =
        bankMonth !== null && glMonth !== null && bankMonth === glMonth ? 'Y' : 'N';

      return {
        matchNum: num,
        description,
        bankAmt,
        bankDesc,
        bankMonth,
        bankCount: bankRows.length,
        glAmt,
        glDesc,
        glMonth,
        glCount: glRows.length,
        variance,
        monthMatch,
      };
    });
};
