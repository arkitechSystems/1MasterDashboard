import React, { useMemo, useState } from 'react';
import './Admin.css';
import './Form990.css';
import {
  CellDef,
  FORM_990_ROWS,
  FinancialState,
  ManualState,
  RowDef,
  resolveValue,
} from './form990Schema';

type Tab = 'form' | 'data';

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const Form990: React.FC = () => {
  const [tab, setTab] = useState<Tab>('form');
  const [manual, setManual] = useState<ManualState>({});

  // Financial pulls come from the live accounting backend eventually.
  // For now everything starts at 0 with a tooltip on each green cell.
  const financial: FinancialState = useMemo(() => ({}), []);

  const setManualValue = (key: string, value: string | number) =>
    setManual((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="admin-page form990-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Form 990</h1>
          <div className="page-sub">
            Hospital Form 990 workspace. Blue cells are typed in directly; green cells pull from
            the chart of accounts / trial balance once the backend is wired up.
          </div>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`br-tab ${tab === 'form' ? 'active' : ''}`}
          onClick={() => setTab('form')}
        >
          <span className="material-icons">description</span>
          Form 990
        </button>
        <button
          type="button"
          className={`br-tab ${tab === 'data' ? 'active' : ''}`}
          onClick={() => setTab('data')}
        >
          <span className="material-icons">edit_note</span>
          Data Input
        </button>
      </div>

      {tab === 'data' && (
        <DataInputTab
          manual={manual}
          financial={financial}
          onChange={setManualValue}
        />
      )}
      {tab === 'form' && <FormTab manual={manual} financial={financial} />}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Data Input tab — full grid of rows with blue /
   green / neutral styling per the source workbook.
   ───────────────────────────────────────────── */
const COL_HEADERS: { col: 'D' | 'E' | 'F' | 'G' | 'H'; label: string }[] = [
  { col: 'D', label: 'Current Year / (A)' },
  { col: 'E', label: 'Prior Year / (B)' },
  { col: 'F', label: '(C) Unrelated Biz' },
  { col: 'G', label: '(D) Excluded Rev' },
  { col: 'H', label: 'Yes / No' },
];

const DataInputTab: React.FC<{
  manual: ManualState;
  financial: FinancialState;
  onChange: (key: string, value: string | number) => void;
}> = ({ manual, financial, onChange }) => (
  <div className="admin-card f990-card">
    <div className="f990-legend">
      <span className="f990-legend-item">
        <span className="f990-swatch manual" /> Manual input
      </span>
      <span className="f990-legend-item">
        <span className="f990-swatch financial" /> Pulled from CoA / trial balance
      </span>
      <span className="f990-legend-item">
        <span className="f990-swatch computed" /> Computed
      </span>
    </div>

    <div className="coa-table-wrap">
      <table className="f990-table">
        <colgroup>
          <col style={{ width: 70 }} />
          <col style={{ width: 60 }} />
          <col />
          <col style={{ width: 150 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 90 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Part</th>
            <th>Line</th>
            <th>Description</th>
            {COL_HEADERS.map((c) => (
              <th key={c.col} className="c">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FORM_990_ROWS.map((row) => {
            if (row.kind === 'section') {
              return (
                <tr key={row.id} className="f990-section-row">
                  <td colSpan={3}>
                    <strong>{row.part}</strong>
                    {row.title && <span className="f990-section-title"> &mdash; {row.title}</span>}
                  </td>
                  <td colSpan={5} />
                </tr>
              );
            }
            return (
              <tr key={row.id}>
                <td className="mono muted">{row.part || ''}</td>
                <td className="mono">{row.line || ''}</td>
                <td>{row.description}</td>
                {COL_HEADERS.map((header) => {
                  const cell = row.cells?.find((c) => c.col === header.col);
                  if (!cell) {
                    return <td key={header.col} className="f990-cell empty" />;
                  }
                  return (
                    <td
                      key={header.col}
                      className={`f990-cell ${cellClass(cell.kind)}`}
                      title={cell.source}
                    >
                      <CellEditor
                        rowId={row.id}
                        cell={cell}
                        row={row}
                        manual={manual}
                        financial={financial}
                        onChange={onChange}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const cellClass = (kind: CellDef['kind']): string => {
  switch (kind) {
    case 'manual-text':
    case 'manual-number':
    case 'manual-yesno':
      return 'manual';
    case 'financial':
      return 'financial';
    case 'computed':
      return 'computed';
  }
};

const CellEditor: React.FC<{
  rowId: string;
  row: RowDef;
  cell: CellDef;
  manual: ManualState;
  financial: FinancialState;
  onChange: (key: string, value: string | number) => void;
}> = ({ rowId, row, cell, manual, financial, onChange }) => {
  const key = `${rowId}.${cell.col}`;

  if (cell.kind === 'manual-text') {
    return (
      <input
        type="text"
        className="f990-input"
        value={(manual[key] as string) ?? ''}
        onChange={(e) => onChange(key, e.target.value)}
      />
    );
  }
  if (cell.kind === 'manual-number') {
    return (
      <input
        type="number"
        className="f990-input number"
        value={(manual[key] as number) ?? ''}
        onChange={(e) => onChange(key, Number(e.target.value) || 0)}
      />
    );
  }
  if (cell.kind === 'manual-yesno') {
    const v = (manual[key] as string) || '';
    return (
      <select
        className="f990-input"
        value={v}
        onChange={(e) => onChange(key, e.target.value)}
      >
        <option value="">—</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }
  // financial + computed both show a resolved number
  const value = resolveValue(row, cell, manual, financial);
  return (
    <span className="f990-readonly mono">
      {typeof value === 'number' ? fmtAmt(value) : value}
    </span>
  );
};

/* ─────────────────────────────────────────────
   Form 990 tab — IRS-style layout. Sections are
   rendered as boxed blocks with numbered lines.
   Values come from the resolved schema.
   ───────────────────────────────────────────── */
const FormTab: React.FC<{
  manual: ManualState;
  financial: FinancialState;
}> = ({ manual, financial }) => {
  const get = (rowId: string, col: 'D' | 'E' | 'F' | 'G'): number | string => {
    const r = FORM_990_ROWS.find((x) => x.id === rowId);
    const c = r?.cells?.find((cc) => cc.col === col);
    if (!r || !c) return 0;
    return resolveValue(r, c, manual, financial);
  };

  const num = (rowId: string, col: 'D' | 'E' | 'F' | 'G'): number => {
    const v = get(rowId, col);
    return typeof v === 'number' ? v : 0;
  };

  const str = (rowId: string, col: 'D' | 'E' | 'F' | 'G' = 'D'): string => {
    const v = get(rowId, col);
    return typeof v === 'string' ? v : '';
  };

  // Sub-section grouping for the Form layout
  const partRows = (part: string) =>
    FORM_990_ROWS.filter((r) => r.kind === 'row' && r.part === part);

  return (
    <div className="f990-form">
      {/* Header banner */}
      <div className="f990-banner">
        <div className="f990-banner-num">990</div>
        <div className="f990-banner-text">
          <div className="f990-banner-title">Form 990</div>
          <div className="f990-banner-sub">
            Return of Organization Exempt From Income Tax
            <br />
            Under section 501(c), 527, or 4947(a)(1) of the Internal Revenue Code (except private
            foundations)
          </div>
        </div>
        <div className="f990-banner-year">2025</div>
      </div>

      {/* Organization information block */}
      <div className="f990-block">
        <div className="f990-block-title">A. Organization information</div>
        <div className="f990-grid two">
          <div className="f990-field">
            <label>C. Name of organization</label>
            <div className="f990-value">{str('org-name') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>D. Employer identification number</label>
            <div className="f990-value mono">{str('org-ein') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>Doing business as</label>
            <div className="f990-value">{str('org-dba') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>E. Telephone number</label>
            <div className="f990-value mono">{str('org-phone') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>Street address and room/suite</label>
            <div className="f990-value">{str('org-street') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>G. Gross receipts $</label>
            <div className="f990-value mono">{fmtAmt(num('org-receipts', 'D'))}</div>
          </div>
          <div className="f990-field">
            <label>City, state, ZIP</label>
            <div className="f990-value">{str('org-city') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>F. Name and address of principal officer</label>
            <div className="f990-value">{str('org-officer') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field">
            <label>J. Website</label>
            <div className="f990-value">{str('org-website') || <em className="muted">—</em>}</div>
          </div>
          <div className="f990-field f990-field-pair">
            <div>
              <label>L. Year of formation</label>
              <div className="f990-value mono">
                {str('org-year') || <em className="muted">—</em>}
              </div>
            </div>
            <div>
              <label>M. State of legal domicile</label>
              <div className="f990-value mono">
                {str('org-state') || <em className="muted">—</em>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Part I — Summary */}
      <div className="f990-block">
        <div className="f990-block-title">Part I &mdash; Summary</div>
        <div className="f990-row text">
          <span className="f990-line-no">1</span>
          <span className="f990-line-label">
            Briefly describe the organization&rsquo;s mission or most significant activities:
          </span>
          <div className="f990-mission">{str('i-1') || <em className="muted">—</em>}</div>
        </div>
        <FormLine line="3" desc="Number of voting members of the governing body" val={num('i-3', 'D')} integer />
        <FormLine line="4" desc="Number of independent voting members of the governing body" val={num('i-4', 'D')} integer />
        <FormLine line="5" desc="Total number of individuals employed in calendar year" val={num('i-5', 'D')} integer />
        <FormLine line="6" desc="Total number of volunteers" val={num('i-6', 'D')} integer />
        <FormLine line="7a" desc="Total unrelated business revenue from Part VIII, column (C), line 12" val={num('i-7a', 'D')} />
        <FormLine line="7b" desc="Net unrelated business taxable income from Form 990-T, line 39" val={num('i-7b', 'D')} />

        <div className="f990-twocol-head">
          <span />
          <span>(A) Current Year</span>
          <span>(B) Prior Year</span>
        </div>
        <FormTwoCol line="8" desc="Contributions and grants (Part VIII, line 1h)" cy={num('i-8', 'D')} py={num('i-8', 'E')} />
        <FormTwoCol line="9" desc="Program service revenue (Part VIII, line 2g)" cy={num('i-9', 'D')} py={num('i-9', 'E')} />
        <FormTwoCol line="10" desc="Investment income (Part VIII, column (A), lines 3, 4, 7d)" cy={num('i-10', 'D')} py={num('i-10', 'E')} />
        <FormTwoCol line="11" desc="Other revenue (Part VIII, lines 5, 6d, 8c, 9c, 10c, 11e)" cy={num('i-11', 'D')} py={num('i-11', 'E')} />
        <FormTwoCol
          line="12"
          desc="Total revenue—add lines 8 through 11"
          cy={num('i-8', 'D') + num('i-9', 'D') + num('i-10', 'D') + num('i-11', 'D')}
          py={num('i-8', 'E') + num('i-9', 'E') + num('i-10', 'E') + num('i-11', 'E')}
          emphasis
        />
        <FormTwoCol line="13" desc="Grants and similar amounts paid (Part IX, column (A), lines 1–3)" cy={num('i-13', 'D')} py={num('i-13', 'E')} />
        <FormTwoCol line="14" desc="Benefits paid to or for members (Part IX, line 4)" cy={num('i-14', 'D')} py={num('i-14', 'E')} />
        <FormTwoCol line="15" desc="Salaries, other compensation, employee benefits (Part IX, lines 5–10)" cy={num('i-15', 'D')} py={num('i-15', 'E')} />
        <FormTwoCol line="16a" desc="Professional fundraising fees (Part IX, line 11e)" cy={num('i-16a', 'D')} py={num('i-16a', 'E')} />
        <div className="f990-row sub">
          <span className="f990-line-no">16b</span>
          <span className="f990-line-label">Total fundraising expenses (Part IX, column (D), line 25):</span>
          <span className="f990-amt mono">{fmtAmt(num('i-16b', 'D'))}</span>
        </div>
        <FormTwoCol line="17" desc="Other expenses (Part IX, column (A), lines 11a–11d, 11f–24e)" cy={num('i-17', 'D')} py={num('i-17', 'E')} />
        <FormTwoCol
          line="18"
          desc="Total expenses. Add lines 13–17"
          cy={
            num('i-13', 'D') + num('i-14', 'D') + num('i-15', 'D') +
            num('i-16a', 'D') + num('i-17', 'D')
          }
          py={
            num('i-13', 'E') + num('i-14', 'E') + num('i-15', 'E') +
            num('i-16a', 'E') + num('i-17', 'E')
          }
          emphasis
        />
        <FormTwoCol
          line="19"
          desc="Revenue less expenses. Subtract line 18 from line 12"
          cy={
            num('i-8', 'D') + num('i-9', 'D') + num('i-10', 'D') + num('i-11', 'D') -
            (num('i-13', 'D') + num('i-14', 'D') + num('i-15', 'D') +
              num('i-16a', 'D') + num('i-17', 'D'))
          }
          py={
            num('i-8', 'E') + num('i-9', 'E') + num('i-10', 'E') + num('i-11', 'E') -
            (num('i-13', 'E') + num('i-14', 'E') + num('i-15', 'E') +
              num('i-16a', 'E') + num('i-17', 'E'))
          }
          emphasis
        />

        <div className="f990-twocol-head">
          <span />
          <span>(A) Beginning of Year</span>
          <span>(B) End of Year</span>
        </div>
        <FormTwoCol line="20" desc="Total assets (Part X, line 16)" cy={num('i-20', 'D')} py={num('i-20', 'E')} />
        <FormTwoCol line="21" desc="Total liabilities (Part X, line 26)" cy={num('i-21', 'D')} py={num('i-21', 'E')} />
        <FormTwoCol
          line="22"
          desc="Net assets or fund balances. Subtract line 21 from line 20"
          cy={num('i-20', 'D') - num('i-21', 'D')}
          py={num('i-20', 'E') - num('i-21', 'E')}
          emphasis
        />
      </div>

      {/* Part VIII — Statement of Revenue */}
      <FormPartTable
        title="Part VIII — Statement of Revenue"
        rows={partRows('VIII')}
        columns={[
          { col: 'D', label: '(A) Total Revenue' },
          { col: 'E', label: '(B) Related / Exempt' },
          { col: 'F', label: '(C) Unrelated Biz' },
          { col: 'G', label: '(D) Excluded 512–514' },
        ]}
        manual={manual}
        financial={financial}
      />

      {/* Part IX — Statement of Functional Expenses */}
      <FormPartTable
        title="Part IX — Statement of Functional Expenses"
        rows={partRows('IX')}
        columns={[
          { col: 'D', label: '(A) Total' },
          { col: 'E', label: '(B) Program Service' },
          { col: 'F', label: '(C) Mgmt & General' },
          { col: 'G', label: '(D) Fundraising' },
        ]}
        manual={manual}
        financial={financial}
      />

      {/* Part X — Balance Sheet */}
      <FormPartTable
        title="Part X — Balance Sheet"
        rows={partRows('X')}
        columns={[
          { col: 'D', label: '(A) Beginning of Year' },
          { col: 'E', label: '(B) End of Year' },
        ]}
        manual={manual}
        financial={financial}
      />

      {/* Part XI — Reconciliation of Net Assets */}
      <FormPartTable
        title="Part XI — Reconciliation of Net Assets"
        rows={partRows('XI')}
        columns={[{ col: 'D', label: 'Amount' }]}
        manual={manual}
        financial={financial}
      />
    </div>
  );
};

const FormLine: React.FC<{
  line: string;
  desc: string;
  val: number;
  integer?: boolean;
}> = ({ line, desc, val, integer }) => (
  <div className="f990-row">
    <span className="f990-line-no">{line}</span>
    <span className="f990-line-label">{desc}</span>
    <span className="f990-amt mono">
      {integer ? val.toLocaleString('en-US') : fmtAmt(val)}
    </span>
  </div>
);

const FormTwoCol: React.FC<{
  line: string;
  desc: string;
  cy: number;
  py: number;
  emphasis?: boolean;
}> = ({ line, desc, cy, py, emphasis }) => (
  <div className={`f990-row twocol ${emphasis ? 'emphasis' : ''}`}>
    <span className="f990-line-no">{line}</span>
    <span className="f990-line-label">{desc}</span>
    <span className="f990-amt mono">{fmtAmt(cy)}</span>
    <span className="f990-amt mono">{fmtAmt(py)}</span>
  </div>
);

const FormPartTable: React.FC<{
  title: string;
  rows: RowDef[];
  columns: { col: 'D' | 'E' | 'F' | 'G'; label: string }[];
  manual: ManualState;
  financial: FinancialState;
}> = ({ title, rows, columns, manual, financial }) => (
  <div className="f990-block">
    <div className="f990-block-title">{title}</div>
    <table className="f990-form-table">
      <colgroup>
        <col style={{ width: 50 }} />
        <col />
        {columns.map((c) => (
          <col key={c.col} style={{ width: 140 }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th />
          <th />
          {columns.map((c) => (
            <th key={c.col} className="r">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="mono">{row.line}</td>
            <td>{row.description}</td>
            {columns.map((header) => {
              const cell = row.cells?.find((c) => c.col === header.col);
              if (!cell) {
                return <td key={header.col} className="r muted">—</td>;
              }
              const v = resolveValue(row, cell, manual, financial);
              return (
                <td key={header.col} className="r mono">
                  {typeof v === 'number' ? fmtAmt(v) : v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default Form990;
