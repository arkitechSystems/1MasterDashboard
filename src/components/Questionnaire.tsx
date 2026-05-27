import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Admin.css';

type StoredSourceKey =
  | 'glDetail'
  | 'trialBalance'
  | 'deptList'
  | 'clientIs'
  | 'clientBs'
  | 'chartOfAccounts';

/** Budget is derived from row identity + the IS row's Budget toggle. */
type SourceKey = StoredSourceKey | 'budget';

type ComparisonKey =
  | 'priorYear'
  | 'priorMonth'
  | 'budget'
  | 'ytdActual'
  | 'ytdBudget'
  | 'ytdPriorYear';

interface QRow {
  id: string;
  label: string;
  requested: boolean;          // client-editable
  glDetail: boolean;
  trialBalance: boolean;
  deptList: boolean;
  clientIs: boolean;
  clientBs: boolean;
  chartOfAccounts: boolean;
  comparisons?: Record<ComparisonKey, boolean>;
}

const COMPARISON_OPTIONS: { key: ComparisonKey; label: string }[] = [
  { key: 'priorYear', label: 'Prior Year' },
  { key: 'priorMonth', label: 'Prior Month' },
  { key: 'budget', label: 'Budget' },
  { key: 'ytdActual', label: 'YTD Actual' },
  { key: 'ytdBudget', label: 'YTD Budget' },
  { key: 'ytdPriorYear', label: 'YTD Prior Year' },
];

const emptyComparisons = (): Record<ComparisonKey, boolean> => ({
  priorYear: false,
  priorMonth: false,
  budget: false,
  ytdActual: false,
  ytdBudget: false,
  ytdPriorYear: false,
});

/* Transposed from the original matrix: reports are now rows,
   source-data items are now columns. */
const INITIAL_ROWS: QRow[] = [
  {
    id: 'r-is',
    label: 'Income Statement',
    requested: false,
    glDetail: true,
    trialBalance: false,
    deptList: false,
    clientIs: true,
    clientBs: false,
    chartOfAccounts: true,
    comparisons: emptyComparisons(),
  },
  {
    id: 'r-is-trend',
    label: '12-Month Trended Income Statement',
    requested: false,
    glDetail: true,
    trialBalance: false,
    deptList: false,
    clientIs: true,
    clientBs: false,
    chartOfAccounts: true,
  },
  {
    id: 'r-dept-is',
    label: 'Departmental Income Statement',
    requested: false,
    glDetail: true,
    trialBalance: false,
    deptList: true,
    clientIs: true,
    clientBs: false,
    chartOfAccounts: true,
  },
  {
    id: 'r-bs',
    label: 'Balance Sheet',
    requested: false,
    glDetail: true,
    trialBalance: true,
    deptList: false,
    clientIs: false,
    clientBs: true,
    chartOfAccounts: true,
  },
  {
    id: 'r-budget',
    label: 'Budget',
    requested: false,
    glDetail: true,
    trialBalance: false,
    deptList: false,
    clientIs: true,
    clientBs: false,
    chartOfAccounts: false,
  },
];

const SOURCE_COLS: { key: SourceKey; label: string; short: string }[] = [
  { key: 'glDetail', label: 'GL Detail Report', short: 'GL Detail' },
  {
    key: 'trialBalance',
    label: 'Trial balance with beginning balances for all balance sheet accounts',
    short: 'Trial Balance',
  },
  { key: 'deptList', label: 'Departmental List', short: 'Dept List' },
  {
    key: 'clientIs',
    label: 'Client Income Statement (we can build it, just need preferred line items)',
    short: 'Client IS',
  },
  {
    key: 'clientBs',
    label: 'Client Balance Sheet (we can build it, just need preferred line items)',
    short: 'Client BS',
  },
  {
    key: 'chartOfAccounts',
    label: 'Chart of Accounts (totality of accounts to map to financials)',
    short: 'CoA',
  },
  {
    key: 'budget',
    label:
      'Budget (always required for Budget deliverable; required for Income Statement / Departmental IS when the Budget comparison is on)',
    short: 'Budget',
  },
];

/* ─────────────────────────────────────────────
   Pricing model
   Rates reflect typical accounting-firm monthly
   close engagements: low end is a small client
   with clean data; high end is a complex multi-
   entity client. Engagement total = monthly fee
   × months in the reporting period.
   ───────────────────────────────────────────── */
const DELIVERABLE_PRICING: Record<string, { low: number; high: number }> = {
  'r-is':       { low: 300, high: 550 },   // Income Statement
  'r-is-trend': { low: 450, high: 800 },   // 12-Month Trended IS
  'r-dept-is':  { low: 550, high: 1000 },  // Departmental IS (segmentation)
  'r-bs':       { low: 400, high: 700 },   // Balance Sheet
  'r-budget':   { low: 350, high: 600 },   // Budget package
};

const COMPARISON_PRICING: Record<ComparisonKey, { low: number; high: number }> = {
  priorYear:    { low: 40, high: 80 },
  priorMonth:   { low: 30, high: 60 },
  budget:       { low: 60, high: 120 },
  ytdActual:    { low: 40, high: 80 },
  ytdBudget:    { low: 60, high: 120 },
  ytdPriorYear: { low: 50, high: 100 },
};

const monthsBetween = (start: string, end: string): number => {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return 1;
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
};

const computePriceRange = (
  rows: QRow[],
  months: number,
): { low: number; high: number } => {
  let low = 0;
  let high = 0;
  const isRequested = rows.find((r) => r.id === 'r-is')?.requested;
  rows.forEach((r) => {
    if (!r.requested) return;
    const base = DELIVERABLE_PRICING[r.id];
    if (base) {
      low += base.low;
      high += base.high;
    }
  });
  if (isRequested) {
    const isRow = rows.find((r) => r.id === 'r-is');
    if (isRow?.comparisons) {
      COMPARISON_OPTIONS.forEach((c) => {
        if (isRow.comparisons?.[c.key]) {
          const cp = COMPARISON_PRICING[c.key];
          low += cp.low;
          high += cp.high;
        }
      });
    }
  }
  return { low: low * months, high: high * months };
};

const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const getSourceValue = (row: QRow, key: SourceKey, rows: QRow[]): boolean => {
  if (key === 'budget') {
    if (row.id === 'r-budget') return true;
    if (row.id === 'r-bs') return false;
    if (row.id === 'r-is' || row.id === 'r-is-trend' || row.id === 'r-dept-is') {
      const isRow = rows.find((r) => r.id === 'r-is');
      return !!isRow?.comparisons?.budget;
    }
    return false;
  }
  return row[key];
};

const Icon: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => (
  <span className="material-icons" style={style}>{name}</span>
);

const MONTH_OPTIONS = (() => {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  // 60 months: 36 back, 24 forward — plenty for typical fiscal-year choices.
  const start = new Date(now.getFullYear(), now.getMonth() - 36, 1);
  for (let i = 0; i < 60; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    out.push({ value, label });
  }
  return out;
})();

const defaultEnd = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();
const defaultStart = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

const Questionnaire: React.FC = () => {
  const [rows, setRows] = useState<QRow[]>(INITIAL_ROWS);
  const [periodStart, setPeriodStart] = useState<string>(defaultStart);
  const [periodEnd, setPeriodEnd] = useState<string>(defaultEnd);

  const setRequested = (id: string, value: boolean) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, requested: value } : r)));

  const toggleComparison = (id: string, key: ComparisonKey) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const current = r.comparisons ?? emptyComparisons();
        return { ...r, comparisons: { ...current, [key]: !current[key] } };
      }),
    );

  const months = useMemo(() => monthsBetween(periodStart, periodEnd), [periodStart, periodEnd]);
  const price = useMemo(() => computePriceRange(rows, months), [rows, months]);
  const anyRequested = rows.some((r) => r.requested);

  return (
    <div className="admin-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Questionnaire</h1>
          <div className="page-sub">
            Pick a report (left) and check which source data you&rsquo;d need from the client to
            produce it. The cells become our intake list and the basis for the pricing estimate.
          </div>
        </div>
      </div>

      <div className="q-period">
        <div className="q-period-field">
          <label htmlFor="q-period-start">Reporting period — start</label>
          <select
            id="q-period-start"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="q-period-arrow">
          <Icon name="arrow_forward" />
        </div>
        <div className="q-period-field">
          <label htmlFor="q-period-end">Reporting period — end</label>
          <select
            id="q-period-end"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="q-period-spacer" />

        <div className="q-price">
          <div className="q-price-k">Estimated price range</div>
          {anyRequested ? (
            <>
              <div className="q-price-v mono">
                {fmtUsd(price.low / months)} &ndash; {fmtUsd(price.high / months)}
                <span className="q-price-unit"> / mo</span>
              </div>
              <div className="q-price-total mono">
                {fmtUsd(price.low)} &ndash; {fmtUsd(price.high)}{' '}
                <span className="q-price-sub">
                  across {months} {months === 1 ? 'month' : 'months'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="q-price-v muted">—</div>
              <div className="q-price-sub">Toggle a deliverable to Yes to see a quote</div>
            </>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="coa-table-wrap">
          <table className="coa-table q-table">
            <colgroup>
              <col style={{ width: 50 }} />
              <col />
              <col style={{ width: 110 }} />
              {SOURCE_COLS.map((c) => (
                <col key={c.key} style={{ width: 130 }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="c">#</th>
                <th>Engagement Deliverable</th>
                <th className="c">Requested</th>
                {SOURCE_COLS.map((c) => (
                  <th key={c.key} className="c" title={c.label}>
                    {c.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={SOURCE_COLS.length + 3} className="coa-empty">
                    No deliverables configured.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className="coa-row">
                  <td className="c muted mono">{i + 1}</td>
                  <td className="q-deliverable">
                    <div className="q-deliverable-label">{r.label}</div>
                    {r.comparisons && (
                      <div className="q-comparisons">
                        <span className="q-comparisons-k">Compare to</span>
                        {COMPARISON_OPTIONS.map((opt) => {
                          const on = !!r.comparisons?.[opt.key];
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              className={`q-chip ${on ? 'on' : ''}`}
                              onClick={() => toggleComparison(r.id, opt.key)}
                              aria-pressed={on}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="c q-cell">
                    <YesNoToggle
                      value={r.requested}
                      onChange={(v) => setRequested(r.id, v)}
                    />
                  </td>
                  {SOURCE_COLS.map((col) => (
                    <td key={col.key} className="c q-cell">
                      <YesNoMark value={getSourceValue(r, col.key, rows)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {anyRequested && (
        <div className="q-previews">
          <div className="q-previews-head">
            <Icon name="visibility" style={{ color: 'var(--ap-accent)' }} />
            <h2>What you&rsquo;re paying for</h2>
            <span className="q-previews-sub">
              Sample layouts with dummy data — not linked to your books
            </span>
          </div>
          {rows.find((r) => r.id === 'r-is')?.requested && <IsPreview />}
          {rows.find((r) => r.id === 'r-is-trend')?.requested && <TrendedIsPreview />}
          {rows.find((r) => r.id === 'r-dept-is')?.requested && <DeptIsPreview />}
          {rows.find((r) => r.id === 'r-bs')?.requested && <BsTrendPreview />}
          {rows.find((r) => r.id === 'r-budget')?.requested && <BudgetPreview />}
        </div>
      )}

      <div className="explainer">
        <Icon name="lightbulb" style={{ color: '#b45309', fontSize: 20 }} />
        <div>
          <strong>How this is used.</strong> Each row is a report the client wants us to produce.
          Each column is a piece of source data we&rsquo;d ask them for. The checked cells are our
          intake list per deliverable — we&rsquo;ll send the consolidated set back to the client,
          and the per-row totals feed the engagement-pricing estimate.
        </div>
      </div>
    </div>
  );
};

const YesNoMark: React.FC<{ value: boolean }> = ({ value }) => (
  <span className={`yn-mark ${value ? 'yes' : 'no'}`} aria-label={value ? 'Yes' : 'No'}>
    {value ? 'Y' : 'N'}
  </span>
);

const YesNoToggle: React.FC<{
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ value, onChange }) => (
  <button
    type="button"
    className={`yn-toggle ${value ? 'yes' : 'no'}`}
    onClick={() => onChange(!value)}
    aria-pressed={value}
    title={value ? 'Click to set to No' : 'Click to set to Yes'}
  >
    {value ? 'Yes' : 'No'}
  </button>
);

/* ─────────────────────────────────────────────
   Preview tables — dummy data, styled with the
   project's .income-statement-table classes so
   they match the real reports visually.
   ───────────────────────────────────────────── */
const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const pct = (n: number) =>
  `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

const cls = (v: number) => (v >= 0 ? 'amount positive' : 'amount negative');

const MONTH_HEADERS_12 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const Sparkline: React.FC<{ values: number[]; color?: string }> = ({ values, color = '#1abc9c' }) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 22;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points} />
    </svg>
  );
};

const PreviewShell: React.FC<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section className="q-preview">
    <div className="q-preview-head">
      <div>
        <h3>{title}</h3>
        <div className="q-preview-sub">{subtitle}</div>
      </div>
      <span className="q-preview-tag">Sample</span>
    </div>
    <div className="table-wrapper">{children}</div>
  </section>
);

const IsPreview: React.FC = () => {
  type R = { label: string; cur: number; prior: number; budget: number; indent?: boolean };
  const rev: R[] = [
    { label: 'Patient Revenue — Inpatient', cur: 845000, prior: 812000, budget: 820000, indent: true },
    { label: 'Patient Revenue — Outpatient', cur: 612000, prior: 583000, budget: 600000, indent: true },
    { label: 'Other Operating Revenue', cur: 84000, prior: 78000, budget: 80000, indent: true },
  ];
  const exp: R[] = [
    { label: 'Salaries & Wages', cur: 612000, prior: 595000, budget: 600000, indent: true },
    { label: 'Employee Benefits', cur: 148000, prior: 142000, budget: 145000, indent: true },
    { label: 'Supplies', cur: 196000, prior: 188000, budget: 190000, indent: true },
    { label: 'Purchased Services', cur: 92000, prior: 95000, budget: 90000, indent: true },
    { label: 'Depreciation', cur: 54000, prior: 54000, budget: 54000, indent: true },
  ];
  const sum = (arr: R[], k: keyof R) => arr.reduce((a, r) => a + (r[k] as number), 0);
  const totRevCur = sum(rev, 'cur');
  const totRevPrior = sum(rev, 'prior');
  const totRevBudget = sum(rev, 'budget');
  const totExpCur = sum(exp, 'cur');
  const totExpPrior = sum(exp, 'prior');
  const totExpBudget = sum(exp, 'budget');
  const niCur = totRevCur - totExpCur;
  const niPrior = totRevPrior - totExpPrior;
  const niBudget = totRevBudget - totExpBudget;

  const row = (r: R) => {
    const v = r.cur - r.prior;
    const vp = (v / Math.abs(r.prior || 1)) * 100;
    const bv = r.cur - r.budget;
    const bvp = (bv / Math.abs(r.budget || 1)) * 100;
    return (
      <tr key={r.label}>
        <td className={`line-item${r.indent ? ' indent' : ''}`}>{r.label}</td>
        <td className="amount">{fmt(r.cur)}</td>
        <td className="amount">{fmt(r.prior)}</td>
        <td className={cls(v)}>{fmt(v)}</td>
        <td className={cls(vp)}>{pct(vp)}</td>
        <td className="amount">{fmt(r.budget)}</td>
        <td className={cls(bv)}>{fmt(bv)}</td>
        <td className={cls(bvp)}>{pct(bvp)}</td>
      </tr>
    );
  };

  const subtotal = (
    label: string,
    cur: number,
    prior: number,
    budget: number,
  ) => {
    const v = cur - prior;
    const vp = (v / Math.abs(prior || 1)) * 100;
    const bv = cur - budget;
    const bvp = (bv / Math.abs(budget || 1)) * 100;
    return (
      <tr className="subtotal">
        <td className="line-item">{label}</td>
        <td className="amount">{fmt(cur)}</td>
        <td className="amount">{fmt(prior)}</td>
        <td className={cls(v)}>{fmt(v)}</td>
        <td className={cls(vp)}>{pct(vp)}</td>
        <td className="amount">{fmt(budget)}</td>
        <td className={cls(bv)}>{fmt(bv)}</td>
        <td className={cls(bvp)}>{pct(bvp)}</td>
      </tr>
    );
  };

  return (
    <PreviewShell
      title="Income Statement"
      subtitle="Current month vs prior month and budget — exactly what you&rsquo;ll see online each month."
    >
      <table className="income-statement-table">
        <thead>
          <tr>
            <th>Line Item</th>
            <th>Current Month</th>
            <th>Prior Month</th>
            <th>Variance</th>
            <th>Variance %</th>
            <th>Budget</th>
            <th>Budget Var</th>
            <th>Budget Var %</th>
          </tr>
        </thead>
        <tbody>
          <tr className="section-header"><td colSpan={8}>Revenue</td></tr>
          {rev.map(row)}
          {subtotal('Total Revenue', totRevCur, totRevPrior, totRevBudget)}
          <tr className="section-header"><td colSpan={8}>Operating Expenses</td></tr>
          {exp.map(row)}
          {subtotal('Total Operating Expenses', totExpCur, totExpPrior, totExpBudget)}
          {subtotal('Net Operating Income', niCur, niPrior, niBudget)}
        </tbody>
      </table>
    </PreviewShell>
  );
};

const TrendedIsPreview: React.FC = () => {
  const lines: { label: string; values: number[]; indent?: boolean }[] = [
    { label: 'Patient Revenue — Inpatient', values: [780, 790, 805, 815, 822, 818, 830, 835, 840, 845, 848, 845].map((v) => v * 1000), indent: true },
    { label: 'Patient Revenue — Outpatient', values: [560, 565, 572, 580, 588, 590, 598, 602, 608, 612, 615, 612].map((v) => v * 1000), indent: true },
    { label: 'Other Operating Revenue', values: [72, 74, 76, 78, 80, 81, 82, 83, 84, 85, 85, 84].map((v) => v * 1000), indent: true },
  ];
  const expLines: { label: string; values: number[]; indent?: boolean }[] = [
    { label: 'Salaries & Wages', values: [575, 580, 585, 590, 595, 600, 602, 605, 608, 610, 612, 612].map((v) => v * 1000), indent: true },
    { label: 'Employee Benefits', values: [138, 140, 141, 142, 144, 145, 146, 147, 147, 148, 148, 148].map((v) => v * 1000), indent: true },
    { label: 'Supplies', values: [180, 182, 185, 188, 190, 191, 192, 193, 194, 195, 196, 196].map((v) => v * 1000), indent: true },
  ];

  const sumCol = (set: typeof lines, i: number) => set.reduce((a, l) => a + l.values[i], 0);
  const revTotals = MONTH_HEADERS_12.map((_, i) => sumCol(lines, i));
  const expTotals = MONTH_HEADERS_12.map((_, i) => sumCol(expLines, i));
  const niTotals = revTotals.map((v, i) => v - expTotals[i]);

  const renderRow = (l: { label: string; values: number[]; indent?: boolean }) => {
    const total = l.values.reduce((a, b) => a + b, 0);
    return (
      <tr key={l.label}>
        <td className={`line-item${l.indent ? ' indent' : ''}`}>{l.label}</td>
        {l.values.map((v, i) => (
          <td key={i} className={`amount month-col${i === 11 ? ' latest' : ''}`}>
            {fmt(v)}
          </td>
        ))}
        <td className="amount">{fmt(total)}</td>
        <td className="sparkline-cell"><Sparkline values={l.values} /></td>
      </tr>
    );
  };

  const renderSubtotal = (label: string, values: number[]) => {
    const total = values.reduce((a, b) => a + b, 0);
    return (
      <tr className="subtotal">
        <td className="line-item">{label}</td>
        {values.map((v, i) => (
          <td key={i} className={`amount month-col${i === 11 ? ' latest' : ''}`}>
            {fmt(v)}
          </td>
        ))}
        <td className="amount">{fmt(total)}</td>
        <td className="sparkline-cell"><Sparkline values={values} /></td>
      </tr>
    );
  };

  return (
    <PreviewShell
      title="12-Month Trended Income Statement"
      subtitle="Twelve months side-by-side with a sparkline trend per row."
    >
      <table className="income-statement-table trend-table">
        <thead>
          <tr>
            <th>Line Item</th>
            {MONTH_HEADERS_12.map((m, i) => (
              <th key={m} className={i === 11 ? 'latest' : ''}>{m}</th>
            ))}
            <th>Total 12 Mo</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          <tr className="section-header"><td colSpan={MONTH_HEADERS_12.length + 3}>Revenue</td></tr>
          {lines.map(renderRow)}
          {renderSubtotal('Total Revenue', revTotals)}
          <tr className="section-header"><td colSpan={MONTH_HEADERS_12.length + 3}>Operating Expenses</td></tr>
          {expLines.map(renderRow)}
          {renderSubtotal('Total Operating Expenses', expTotals)}
          {renderSubtotal('Net Operating Income', niTotals)}
        </tbody>
      </table>
    </PreviewShell>
  );
};

const DeptIsPreview: React.FC = () => {
  const depts = ['Inpatient', 'Outpatient', 'ER', 'Total'];
  const lines = [
    { label: 'Patient Revenue', values: [845000, 612000, 218000, 1675000], indent: true },
    { label: 'Other Operating Revenue', values: [42000, 28000, 14000, 84000], indent: true },
    { label: 'Salaries & Wages', values: [305000, 215000, 92000, 612000], indent: true, neg: true },
    { label: 'Employee Benefits', values: [74000, 52000, 22000, 148000], indent: true, neg: true },
    { label: 'Supplies', values: [88000, 64000, 44000, 196000], indent: true, neg: true },
  ];

  return (
    <PreviewShell
      title="Departmental Income Statement"
      subtitle="Same period split by department so leaders can see contribution by service line."
    >
      <table className="income-statement-table">
        <thead>
          <tr>
            <th>Line Item</th>
            {depts.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="section-header"><td colSpan={depts.length + 1}>Revenue by Department</td></tr>
          {lines.slice(0, 2).map((l) => (
            <tr key={l.label}>
              <td className="line-item indent">{l.label}</td>
              {l.values.map((v, i) => (
                <td key={i} className="amount">{fmt(v)}</td>
              ))}
            </tr>
          ))}
          <tr className="section-header"><td colSpan={depts.length + 1}>Operating Expenses by Department</td></tr>
          {lines.slice(2).map((l) => (
            <tr key={l.label}>
              <td className="line-item indent">{l.label}</td>
              {l.values.map((v, i) => (
                <td key={i} className="amount">{fmt(v)}</td>
              ))}
            </tr>
          ))}
          <tr className="subtotal">
            <td className="line-item">Net Operating Income</td>
            <td className="amount positive">{fmt(420000)}</td>
            <td className="amount positive">{fmt(309000)}</td>
            <td className="amount positive">{fmt(74000)}</td>
            <td className="amount positive">{fmt(803000)}</td>
          </tr>
        </tbody>
      </table>
    </PreviewShell>
  );
};

const BsTrendPreview: React.FC = () => {
  const lines: { label: string; values: number[]; section: string; indent?: boolean }[] = [
    { label: 'Cash & Equivalents', values: [4200, 4350, 4280, 4400, 4520, 4480, 4610, 4720, 4880, 4950, 5040, 5180].map((v) => v * 1000), section: 'Current Assets', indent: true },
    { label: 'Accounts Receivable', values: [3800, 3920, 4000, 4080, 4120, 4180, 4220, 4280, 4340, 4400, 4460, 4520].map((v) => v * 1000), section: 'Current Assets', indent: true },
    { label: 'Inventory', values: [820, 830, 845, 860, 870, 880, 890, 900, 910, 920, 930, 940].map((v) => v * 1000), section: 'Current Assets', indent: true },
    { label: 'Accounts Payable', values: [1100, 1140, 1180, 1200, 1240, 1280, 1310, 1340, 1370, 1400, 1430, 1460].map((v) => v * 1000), section: 'Current Liabilities', indent: true },
    { label: 'Accrued Wages', values: [480, 490, 500, 510, 520, 530, 540, 550, 560, 570, 580, 590].map((v) => v * 1000), section: 'Current Liabilities', indent: true },
  ];

  const renderRow = (l: typeof lines[number]) => (
    <tr key={l.label}>
      <td className={`line-item${l.indent ? ' indent' : ''}`}>{l.label}</td>
      {l.values.map((v, i) => (
        <td key={i} className={`amount month-col${i === 11 ? ' latest' : ''}`}>
          {fmt(v)}
        </td>
      ))}
      <td className="sparkline-cell"><Sparkline values={l.values} color="#3498db" /></td>
    </tr>
  );

  return (
    <PreviewShell
      title="Balance Sheet — 12-Month Trend"
      subtitle="Balance-sheet accounts trended month-by-month so leaders can spot working-capital shifts."
    >
      <table className="income-statement-table trend-table">
        <thead>
          <tr>
            <th>Line Item</th>
            {MONTH_HEADERS_12.map((m, i) => (
              <th key={m} className={i === 11 ? 'latest' : ''}>{m}</th>
            ))}
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          <tr className="section-header"><td colSpan={MONTH_HEADERS_12.length + 2}>Current Assets</td></tr>
          {lines.filter((l) => l.section === 'Current Assets').map(renderRow)}
          <tr className="section-header"><td colSpan={MONTH_HEADERS_12.length + 2}>Current Liabilities</td></tr>
          {lines.filter((l) => l.section === 'Current Liabilities').map(renderRow)}
        </tbody>
      </table>
    </PreviewShell>
  );
};

const BudgetPreview: React.FC = () => {
  // Months 1–7 are Actual, 8–12 are Projection (matches a fiscal-year FYTD pattern).
  const months = MONTH_HEADERS_12;
  const actualCount = 7;
  const lines: { label: string; values: number[]; budget: number; indent?: boolean }[] = [
    {
      label: 'Patient Revenue',
      values: [780, 805, 820, 818, 830, 835, 840, 845, 848, 850, 852, 855].map((v) => v * 1000),
      budget: 9600000,
      indent: true,
    },
    {
      label: 'Other Operating Revenue',
      values: [72, 76, 78, 80, 82, 83, 84, 85, 85, 86, 86, 87].map((v) => v * 1000),
      budget: 960000,
      indent: true,
    },
    {
      label: 'Salaries & Wages',
      values: [575, 585, 595, 600, 605, 608, 610, 612, 614, 615, 616, 618].map((v) => v * 1000),
      budget: 7200000,
      indent: true,
    },
  ];

  return (
    <PreviewShell
      title="Budget"
      subtitle="Actuals to date with projections to year-end, compared against the approved budget."
    >
      <table className="income-statement-table trend-table">
        <thead>
          <tr>
            <th rowSpan={2}>Line Item</th>
            {months.map((m, i) => (
              <th key={m} className={i === 11 ? 'latest' : ''}>{m}</th>
            ))}
            <th rowSpan={2}>FYTD (Annualized)</th>
            <th rowSpan={2}>Budget</th>
            <th rowSpan={2}>Variance</th>
            <th rowSpan={2}>Variance %</th>
          </tr>
          <tr className="proj-subhead">
            {months.map((_, i) => (
              <th key={i} className={i < actualCount ? 'pill-actual' : 'pill-proj'}>
                {i < actualCount ? 'Actual' : 'Projection'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const total = l.values.reduce((a, b) => a + b, 0);
            const variance = total - l.budget;
            const variancePct = (variance / Math.abs(l.budget || 1)) * 100;
            return (
              <tr key={l.label}>
                <td className={`line-item${l.indent ? ' indent' : ''}`}>{l.label}</td>
                {l.values.map((v, i) => (
                  <td
                    key={i}
                    className={`amount month-col${i === 11 ? ' latest' : ''}`}
                  >
                    {fmt(v)}
                  </td>
                ))}
                <td className="amount">{fmt(total)}</td>
                <td className="amount">{fmt(l.budget)}</td>
                <td className={cls(variance)}>{fmt(variance)}</td>
                <td className={cls(variancePct)}>{pct(variancePct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PreviewShell>
  );
};

export default Questionnaire;
