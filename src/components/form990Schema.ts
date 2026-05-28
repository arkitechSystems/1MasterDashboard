/* ────────────────────────────────────────────────────────────
   Schema for IRS Form 990 (2025) data-input + form layout.
   Mirrors the structure of the source workbook so that:
     • BLUE cells = manual typed inputs (state-backed)
     • GREEN cells = pulled from CoA / trial balance (defaults
       to 0 until the live join is wired up)
     • NEUTRAL cells = computed from other cells on the form
   ──────────────────────────────────────────────────────────── */

export type CellKind =
  | 'manual-text'
  | 'manual-number'
  | 'manual-yesno'
  | 'financial'
  | 'computed';

/** Stored manual entries, keyed by row.id + column letter. */
export type ManualState = Record<string, string | number | boolean>;
/** Financial pulls, same key shape, defaulted to 0 today. */
export type FinancialState = Record<string, number>;

export interface CellDef {
  col: 'D' | 'E' | 'F' | 'G' | 'H';
  kind: CellKind;
  /** Description of where this green cell pulls from (for tooltip). */
  source?: string;
  /** For computed cells, the formula function. */
  compute?: (manual: ManualState, financial: FinancialState, rowId: string) => number;
  /** Sums other rows' columns. */
  sumOf?: { rowId: string; col: 'D' | 'E' | 'F' | 'G' }[];
  /** Single-row reference (e.g. "= D48"). */
  copyOf?: { rowId: string; col: 'D' | 'E' | 'F' | 'G' };
}

export interface RowDef {
  id: string;
  kind: 'section' | 'subheader' | 'row';
  part?: string;        // 'PART I', 'PART VIII', etc.
  title?: string;       // section title
  line?: string;        // '1a', '20', etc.
  description?: string;
  cells?: CellDef[];
}

/** Sum helper for computed cells. */
const sum = (
  ids: string[],
  col: 'D' | 'E' | 'F' | 'G',
): CellDef['sumOf'] => ids.map((rowId) => ({ rowId, col }));

export const FORM_990_ROWS: RowDef[] = [
  /* ── Organization information ─────────────────────────── */
  { id: 'sec-org', kind: 'section', part: 'HEADER', title: 'Organization Information' },
  { id: 'org-name', kind: 'row', part: 'C', description: 'Name of organization',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-dba', kind: 'row', part: 'C', description: 'Doing business as',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-street', kind: 'row', part: 'C', description: 'Street address and room/suite',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-city', kind: 'row', part: 'C', description: 'City, state, ZIP',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-ein', kind: 'row', part: 'D', description: 'Employer identification number (EIN)',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-phone', kind: 'row', part: 'E', description: 'Telephone number',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-officer', kind: 'row', part: 'F', description: 'Name and address of principal officer',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-receipts', kind: 'row', part: 'G', description: 'Gross receipts',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'org-website', kind: 'row', part: 'J', description: 'Website',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-year', kind: 'row', part: 'L', description: 'Year of formation',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'org-state', kind: 'row', part: 'M', description: 'State of legal domicile',
    cells: [{ col: 'D', kind: 'manual-text' }] },

  /* ── Part I — Summary ─────────────────────────────────── */
  { id: 'sec-i', kind: 'section', part: 'PART I', title: 'Summary' },
  { id: 'i-1', kind: 'row', part: 'I', line: '1', description: 'Mission description',
    cells: [{ col: 'D', kind: 'manual-text' }] },
  { id: 'i-3', kind: 'row', part: 'I', line: '3', description: 'Number of voting members of governing body',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-4', kind: 'row', part: 'I', line: '4', description: 'Number of independent voting members',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-5', kind: 'row', part: 'I', line: '5', description: 'Total number of individuals employed in calendar year',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-6', kind: 'row', part: 'I', line: '6', description: 'Total number of volunteers',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-7a', kind: 'row', part: 'I', line: '7a', description: 'Total unrelated business revenue',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-7b', kind: 'row', part: 'I', line: '7b', description: 'Net unrelated business taxable income',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-8', kind: 'row', part: 'I', line: '8', description: 'Contributions and grants (Part VIII, line 1h)',
    cells: [
      { col: 'D', kind: 'computed',
        sumOf: sum(['viii-1a','viii-1b','viii-1c','viii-1d','viii-1e','viii-1f'], 'D') },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-9', kind: 'row', part: 'I', line: '9', description: 'Program service revenue (Part VIII, line 2g)',
    cells: [
      { col: 'D', kind: 'financial', source: 'Inpatient + Outpatient revenue, net of contractual allowances / bad debt' },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-10', kind: 'row', part: 'I', line: '10', description: 'Investment income',
    cells: [
      { col: 'D', kind: 'computed', copyOf: { rowId: 'viii-3', col: 'D' } },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-11', kind: 'row', part: 'I', line: '11', description: 'Other revenue',
    cells: [
      { col: 'D', kind: 'financial', source: 'Other operating revenue + Gain/Loss on asset disposal' },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-13', kind: 'row', part: 'I', line: '13', description: 'Grants and similar amounts paid',
    cells: [
      { col: 'D', kind: 'computed', sumOf: sum(['ix-1','ix-2','ix-3'], 'D') },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-14', kind: 'row', part: 'I', line: '14', description: 'Benefits paid to or for members',
    cells: [
      { col: 'D', kind: 'computed', copyOf: { rowId: 'ix-4', col: 'D' } },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-15', kind: 'row', part: 'I', line: '15', description: 'Salaries, other compensation, employee benefits',
    cells: [
      { col: 'D', kind: 'computed',
        sumOf: sum(['ix-5','ix-7','ix-8','ix-9','ix-10'], 'D') },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-16a', kind: 'row', part: 'I', line: '16a', description: 'Professional fundraising fees',
    cells: [
      { col: 'D', kind: 'computed', copyOf: { rowId: 'ix-11e', col: 'D' } },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-16b', kind: 'row', part: 'I', line: '16b', description: 'Total fundraising expenses',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'i-17', kind: 'row', part: 'I', line: '17', description: 'Other expenses',
    cells: [
      { col: 'D', kind: 'computed',
        sumOf: sum(
          ['ix-12','ix-13','ix-14','ix-15','ix-16','ix-17','ix-18','ix-19','ix-20','ix-21','ix-22','ix-23','ix-24a','ix-24b','ix-24c','ix-24d','ix-24e'],
          'D',
        ) },
      { col: 'E', kind: 'manual-number' },
    ] },
  { id: 'i-20', kind: 'row', part: 'I', line: '20', description: 'Total assets',
    cells: [
      { col: 'D', kind: 'financial', source: 'Sum of asset accounts on the trial balance (beginning of year)' },
      { col: 'E', kind: 'financial', source: 'Sum of asset accounts on the trial balance (end of year)' },
    ] },
  { id: 'i-21', kind: 'row', part: 'I', line: '21', description: 'Total liabilities',
    cells: [
      { col: 'D', kind: 'financial', source: 'Sum of liability accounts on the trial balance (beginning of year)' },
      { col: 'E', kind: 'financial', source: 'Sum of liability accounts on the trial balance (end of year)' },
    ] },

  /* ── Part VIII — Statement of Revenue ─────────────────── */
  { id: 'sec-viii', kind: 'section', part: 'PART VIII', title: 'Statement of Revenue' },
  { id: 'viii-1a', kind: 'row', part: 'VIII', line: '1a', description: 'Federated campaigns',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'viii-1b', kind: 'row', part: 'VIII', line: '1b', description: 'Membership dues',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'viii-1c', kind: 'row', part: 'VIII', line: '1c', description: 'Fundraising events',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'viii-1d', kind: 'row', part: 'VIII', line: '1d', description: 'Related organizations',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'viii-1e', kind: 'row', part: 'VIII', line: '1e', description: 'Government grants (contributions)',
    cells: [{ col: 'D', kind: 'financial', source: 'Property Tax Revenue accounts' }] },
  { id: 'viii-1f', kind: 'row', part: 'VIII', line: '1f', description: 'All other contributions, gifts, grants',
    cells: [{ col: 'D', kind: 'financial', source: 'Other Non-Operating Revenue accounts' }] },
  { id: 'viii-1g', kind: 'row', part: 'VIII', line: '1g', description: 'Noncash contributions (included in 1a–1f)',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'viii-3', kind: 'row', part: 'VIII', line: '3', description: 'Investment income (dividends, interest, etc.)',
    cells: [
      { col: 'D', kind: 'financial', source: 'Accounts starting with 53987 (investment income)' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'viii-3', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'viii-4', kind: 'row', part: 'VIII', line: '4', description: 'Income from investment of tax-exempt bond proceeds',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'viii-5', kind: 'row', part: 'VIII', line: '5', description: 'Royalties',
    cells: [{ col: 'D', kind: 'manual-number' }] },

  /* ── Part IX — Statement of Functional Expenses ───────── */
  { id: 'sec-ix', kind: 'section', part: 'PART IX', title: 'Statement of Functional Expenses' },
  { id: 'ix-1', kind: 'row', part: 'IX', line: '1', description: 'Grants to domestic orgs/govts',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-2', kind: 'row', part: 'IX', line: '2', description: 'Grants to domestic individuals',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-3', kind: 'row', part: 'IX', line: '3', description: 'Grants to foreign organizations/individuals',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-4', kind: 'row', part: 'IX', line: '4', description: 'Benefits paid to or for members',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-5', kind: 'row', part: 'IX', line: '5', description: 'Compensation of current officers, directors, key employees',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-7', kind: 'row', part: 'IX', line: '7', description: 'Other salaries and wages',
    cells: [
      { col: 'D', kind: 'financial', source: 'Salaries and wages accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-7', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-8', kind: 'row', part: 'IX', line: '8', description: 'Pension plan accruals and contributions',
    cells: [
      { col: 'D', kind: 'financial', source: 'Pension / retirement contribution accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-8', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-9', kind: 'row', part: 'IX', line: '9', description: 'Other employee benefits',
    cells: [
      { col: 'D', kind: 'financial', source: 'Employee benefits accounts (healthcare, etc.)' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-9', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-10', kind: 'row', part: 'IX', line: '10', description: 'Payroll taxes',
    cells: [
      { col: 'D', kind: 'financial', source: 'Payroll tax accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-10', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-11e', kind: 'row', part: 'IX', line: '11e', description: 'Professional fundraising services',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-12', kind: 'row', part: 'IX', line: '12', description: 'Advertising and promotion',
    cells: [
      { col: 'D', kind: 'financial', source: 'Advertising accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-12', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-13', kind: 'row', part: 'IX', line: '13', description: 'Office expenses',
    cells: [
      { col: 'D', kind: 'financial', source: 'Office expense / supplies accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-13', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-14', kind: 'row', part: 'IX', line: '14', description: 'Information technology',
    cells: [
      { col: 'D', kind: 'financial', source: 'IT / software / licensing accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-14', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-15', kind: 'row', part: 'IX', line: '15', description: 'Royalties',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-16', kind: 'row', part: 'IX', line: '16', description: 'Occupancy',
    cells: [
      { col: 'D', kind: 'financial', source: 'Rent / utilities accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-16', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-17', kind: 'row', part: 'IX', line: '17', description: 'Travel',
    cells: [
      { col: 'D', kind: 'financial', source: 'Travel accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-17', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-18', kind: 'row', part: 'IX', line: '18', description: 'Payments of travel/entertainment for public officials',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-19', kind: 'row', part: 'IX', line: '19', description: 'Conferences, conventions, and meetings',
    cells: [
      { col: 'D', kind: 'financial', source: 'Conference / meeting accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-19', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-20', kind: 'row', part: 'IX', line: '20', description: 'Interest',
    cells: [
      { col: 'D', kind: 'financial', source: 'Interest expense accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-20', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-21', kind: 'row', part: 'IX', line: '21', description: 'Payments to affiliates',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-22', kind: 'row', part: 'IX', line: '22', description: 'Depreciation, depletion, and amortization',
    cells: [
      { col: 'D', kind: 'financial', source: 'Depreciation / amortization accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-22', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-23', kind: 'row', part: 'IX', line: '23', description: 'Insurance',
    cells: [
      { col: 'D', kind: 'financial', source: 'Insurance expense accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-23', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-24a', kind: 'row', part: 'IX', line: '24a', description: 'Other expense (describe): purchased services',
    cells: [
      { col: 'D', kind: 'financial', source: 'Purchased services / contract labor accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-24a', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-24b', kind: 'row', part: 'IX', line: '24b', description: 'Other expense (describe): supplies',
    cells: [
      { col: 'D', kind: 'financial', source: 'Medical supplies / pharmacy / drugs accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-24b', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-24c', kind: 'row', part: 'IX', line: '24c', description: 'Other expense (describe): freight',
    cells: [
      { col: 'D', kind: 'financial', source: 'Freight accounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-24c', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-24d', kind: 'row', part: 'IX', line: '24d', description: 'Other expense (describe): charity care / bad debt / other',
    cells: [
      { col: 'D', kind: 'financial', source: 'Other expenses + Charity Care + Bad Debt + Other Discounts' },
      { col: 'E', kind: 'computed', copyOf: { rowId: 'ix-24d', col: 'D' } },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },
  { id: 'ix-24e', kind: 'row', part: 'IX', line: '24e', description: 'All other expenses',
    cells: [
      { col: 'D', kind: 'manual-number' },
      { col: 'E', kind: 'manual-number' },
      { col: 'F', kind: 'manual-number' },
      { col: 'G', kind: 'manual-number' },
    ] },

  /* ── Part X — Balance Sheet ───────────────────────────── */
  { id: 'sec-x', kind: 'section', part: 'PART X', title: 'Balance Sheet' },
  { id: 'x-1', kind: 'row', part: 'X', line: '1', description: 'Cash—non-interest-bearing',
    cells: [
      { col: 'D', kind: 'financial', source: 'Cash and Cash Equivalents (BOY)' },
      { col: 'E', kind: 'financial', source: 'Cash and Cash Equivalents (EOY)' },
    ] },
  { id: 'x-2', kind: 'row', part: 'X', line: '2', description: 'Savings and temporary cash investments',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-3', kind: 'row', part: 'X', line: '3', description: 'Pledges and grants receivable, net',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-4', kind: 'row', part: 'X', line: '4', description: 'Accounts receivable, net',
    cells: [
      { col: 'D', kind: 'financial', source: 'Net Accounts Receivable (BOY)' },
      { col: 'E', kind: 'financial', source: 'Net Accounts Receivable (EOY)' },
    ] },
  { id: 'x-5', kind: 'row', part: 'X', line: '5', description: 'Loans/receivables from officers, directors, etc.',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-6', kind: 'row', part: 'X', line: '6', description: 'Loans/receivables from other disqualified persons',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-7', kind: 'row', part: 'X', line: '7', description: 'Notes and loans receivable, net',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-8', kind: 'row', part: 'X', line: '8', description: 'Inventories for sale or use',
    cells: [
      { col: 'D', kind: 'financial', source: 'Inventory (BOY)' },
      { col: 'E', kind: 'financial', source: 'Inventory (EOY)' },
    ] },
  { id: 'x-9', kind: 'row', part: 'X', line: '9', description: 'Prepaid expenses and deferred charges',
    cells: [
      { col: 'D', kind: 'financial', source: 'Prepaid Expense (BOY)' },
      { col: 'E', kind: 'financial', source: 'Prepaid Expense (EOY)' },
    ] },
  { id: 'x-10a', kind: 'row', part: 'X', line: '10a', description: 'Land, buildings, equipment: cost or other basis',
    cells: [
      { col: 'D', kind: 'financial', source: 'Buildings + Furniture/Fixtures + Minor & Major Equipment + Capital Lease (BOY)' },
      { col: 'E', kind: 'financial', source: 'Same accounts (EOY)' },
    ] },
  { id: 'x-10b', kind: 'row', part: 'X', line: '10b', description: 'Less: accumulated depreciation',
    cells: [
      { col: 'D', kind: 'financial', source: 'Accumulated Depreciation (BOY)' },
      { col: 'E', kind: 'financial', source: 'Accumulated Depreciation (EOY)' },
    ] },
  { id: 'x-11', kind: 'row', part: 'X', line: '11', description: 'Investments—publicly traded securities',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-12', kind: 'row', part: 'X', line: '12', description: 'Investments—other securities',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-13', kind: 'row', part: 'X', line: '13', description: 'Investments—program-related',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-14', kind: 'row', part: 'X', line: '14', description: 'Intangible assets',
    cells: [
      { col: 'D', kind: 'financial', source: 'Intangible Assets (BOY)' },
      { col: 'E', kind: 'financial', source: 'Intangible Assets (EOY)' },
    ] },
  { id: 'x-15', kind: 'row', part: 'X', line: '15', description: 'Other assets',
    cells: [
      { col: 'D', kind: 'financial', source: 'Total Other Assets (BOY)' },
      { col: 'E', kind: 'financial', source: 'Total Other Assets (EOY)' },
    ] },
  { id: 'x-17', kind: 'row', part: 'X', line: '17', description: 'Accounts payable and accrued expenses',
    cells: [
      { col: 'D', kind: 'financial', source: 'AP + Accrued Salary/Benefits + Other Accrued Liabilities (BOY)' },
      { col: 'E', kind: 'financial', source: 'Same accounts (EOY)' },
    ] },
  { id: 'x-18', kind: 'row', part: 'X', line: '18', description: 'Grants payable',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-19', kind: 'row', part: 'X', line: '19', description: 'Deferred revenue',
    cells: [
      { col: 'D', kind: 'financial', source: 'Deferred Revenue – Property Tax (BOY)' },
      { col: 'E', kind: 'financial', source: 'Deferred Revenue – Property Tax (EOY)' },
    ] },
  { id: 'x-20', kind: 'row', part: 'X', line: '20', description: 'Tax-exempt bond liabilities',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-21', kind: 'row', part: 'X', line: '21', description: 'Escrow or custodial account liability',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-22', kind: 'row', part: 'X', line: '22', description: 'Loans/payables to officers, directors, etc.',
    cells: [
      { col: 'D', kind: 'financial', source: 'Intercompany Payables (BOY)' },
      { col: 'E', kind: 'financial', source: 'Intercompany Payables (EOY)' },
    ] },
  { id: 'x-23', kind: 'row', part: 'X', line: '23', description: 'Secured mortgages and notes payable',
    cells: [
      { col: 'D', kind: 'financial', source: 'Other Long Term Liabilities (BOY)' },
      { col: 'E', kind: 'financial', source: 'Other Long Term Liabilities (EOY)' },
    ] },
  { id: 'x-24', kind: 'row', part: 'X', line: '24', description: 'Unsecured notes and loans payable',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-25', kind: 'row', part: 'X', line: '25', description: 'Other liabilities',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-27', kind: 'row', part: 'X', line: '27', description: 'Unrestricted net assets',
    cells: [
      { col: 'D', kind: 'financial', source: 'Fund Balance – Accumulated (BOY)' },
      { col: 'E', kind: 'financial', source: 'Fund Balance – Accumulated (EOY)' },
    ] },
  { id: 'x-28', kind: 'row', part: 'X', line: '28', description: 'Temporarily restricted net assets',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-29', kind: 'row', part: 'X', line: '29', description: 'Permanently restricted net assets',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-30', kind: 'row', part: 'X', line: '30', description: 'Capital stock or trust principal, or current funds',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },
  { id: 'x-31', kind: 'row', part: 'X', line: '31', description: 'Paid-in or capital surplus, or land/building/equipment fund',
    cells: [{ col: 'D', kind: 'manual-number' }, { col: 'E', kind: 'manual-number' }] },

  /* ── Part XI — Reconciliation of Net Assets ───────────── */
  { id: 'sec-xi', kind: 'section', part: 'PART XI', title: 'Reconciliation of Net Assets' },
  { id: 'xi-5', kind: 'row', part: 'XI', line: '5', description: 'Net unrealized gains (losses) on investments',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'xi-6', kind: 'row', part: 'XI', line: '6', description: 'Donated services and use of facilities',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'xi-7', kind: 'row', part: 'XI', line: '7', description: 'Investment expenses',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'xi-8', kind: 'row', part: 'XI', line: '8', description: 'Prior period adjustments',
    cells: [{ col: 'D', kind: 'manual-number' }] },
  { id: 'xi-9', kind: 'row', part: 'XI', line: '9', description: 'Other changes in net assets or fund balances',
    cells: [{ col: 'D', kind: 'manual-number' }] },
];

/* ──────────────────────────────────────────────
   Resolver — given the manual + financial state,
   produce a single numeric/string lookup for each
   (rowId, col) pair, including computed values.
   ────────────────────────────────────────────── */
export const resolveValue = (
  row: RowDef,
  cell: CellDef,
  manual: ManualState,
  financial: FinancialState,
): number | string => {
  const key = `${row.id}.${cell.col}`;
  if (cell.kind === 'manual-text' || cell.kind === 'manual-yesno') {
    return (manual[key] as string) ?? '';
  }
  if (cell.kind === 'manual-number') {
    return Number(manual[key]) || 0;
  }
  if (cell.kind === 'financial') {
    return Number(financial[key]) || 0;
  }
  if (cell.kind === 'computed') {
    if (cell.copyOf) {
      // Re-resolve the referenced cell.
      const refRow = FORM_990_ROWS.find((r) => r.id === cell.copyOf!.rowId);
      const refCell = refRow?.cells?.find((c) => c.col === cell.copyOf!.col);
      if (!refRow || !refCell) return 0;
      const v = resolveValue(refRow, refCell, manual, financial);
      return typeof v === 'number' ? v : 0;
    }
    if (cell.sumOf) {
      let total = 0;
      cell.sumOf.forEach((ref) => {
        const refRow = FORM_990_ROWS.find((r) => r.id === ref.rowId);
        const refCell = refRow?.cells?.find((c) => c.col === ref.col);
        if (refRow && refCell) {
          const v = resolveValue(refRow, refCell, manual, financial);
          if (typeof v === 'number') total += v;
        }
      });
      return total;
    }
    if (cell.compute) return cell.compute(manual, financial, row.id);
  }
  return 0;
};
