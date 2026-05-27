import React, { useMemo, useState } from 'react';
import {
  BALANCES_DATA,
  BankRow,
  GLRow,
  MatchRow,
  computeMatches,
  formatAmount,
} from './data';

interface ReconciliationProps {
  selectedMonth: string;       // ME serial from dropdown (e.g. "46142")
  bankData: BankRow[];
  glData: GLRow[];
  glAccountNumber: string;
  setGlAccountNumber: (v: string) => void;
  accountDescription: string;
  setAccountDescription: (v: string) => void;
  bankName: string;
  setBankName: (v: string) => void;
  bankAccountNumber: string;
  setBankAccountNumber: (v: string) => void;
  hideZeroReconciling: boolean;
  setHideZeroReconciling: (v: boolean) => void;
  onMatchClick: (matchNum: number) => void;
  bankBalances: Record<number, number>;
  glBalances: Record<number, number>;
}

const Amt: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null) return <span className="faint">—</span>;
  const cls = value < 0 ? 'neg' : value > 0 ? 'pos' : 'zero';
  return <span className={`amt ${cls}`}>{formatAmount(value)}</span>;
};

const EXCEL_EPOCH = new Date(1899, 11, 30).getTime();
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const formatPeriodEnding = (month: string): string => {
  if (!month) return '';
  const serial = parseInt(month, 10);
  if (!Number.isNaN(serial)) {
    const d = new Date(EXCEL_EPOCH + serial * 86400000);
    return `${MONTH_NAMES_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  return month;
};

const numOrZero = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0);

// Description rule: bank-only → bank desc; gl-only → gl desc;
// both → "bankDesc glDesc" joined by a space.
const buildDescription = (m: MatchRow): string => {
  if (m.matchNum === 0) return 'Unreconciled Activity';
  const hasBank = m.bankCount > 0;
  const hasGl = m.glCount > 0;
  if (hasBank && hasGl) return `${m.bankDesc} ${m.glDesc}`;
  if (hasBank) return m.bankDesc;
  if (hasGl) return m.glDesc;
  return '';
};

const Reconciliation: React.FC<ReconciliationProps> = ({
  selectedMonth,
  bankData,
  glData,
  glAccountNumber,
  setGlAccountNumber,
  accountDescription,
  setAccountDescription,
  bankName,
  setBankName,
  bankAccountNumber,
  setBankAccountNumber,
  hideZeroReconciling,
  setHideZeroReconciling,
  onMatchClick,
  bankBalances,
  glBalances,
}) => {
  // Free-form notes per row, keyed by `match-${matchNum}` or 'bank-balance'.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteFor = (key: string) => notes[key] || '';
  const setNote = (key: string, value: string) =>
    setNotes((prev) => ({ ...prev, [key]: value }));

  const periodEndingText = formatPeriodEnding(selectedMonth);
  const periodSerial = parseInt(selectedMonth, 10);
  const hasPeriod = !Number.isNaN(periodSerial);

  // GL Account Balance lookup (Current Month + Prior Month) from BALANCES_DATA
  const { currentBalance, priorBalance, balanceChange, bankBalanceForMonth } = useMemo(() => {
    if (!hasPeriod) {
      return {
        currentBalance: null as number | null,
        priorBalance: null as number | null,
        balanceChange: null as number | null,
        bankBalanceForMonth: null as number | null,
      };
    }
    const idx = BALANCES_DATA.findIndex((r) => r.me === periodSerial);
    if (idx === -1) {
      return { currentBalance: null, priorBalance: null, balanceChange: null, bankBalanceForMonth: null };
    }
    const cur = periodSerial in glBalances ? glBalances[periodSerial] : BALANCES_DATA[idx].glBalance;
    const priorMe = idx > 0 ? BALANCES_DATA[idx - 1].me : null;
    const pri =
      priorMe !== null && priorMe in glBalances
        ? glBalances[priorMe]
        : idx > 0
          ? BALANCES_DATA[idx - 1].glBalance
          : null;
    const change = numOrZero(cur) - numOrZero(pri);
    const bankBal =
      periodSerial in bankBalances ? bankBalances[periodSerial] : BALANCES_DATA[idx].bankBalance;
    return {
      currentBalance: cur,
      priorBalance: pri,
      balanceChange: change,
      bankBalanceForMonth: bankBal,
    };
  }, [hasPeriod, periodSerial, bankBalances, glBalances]);

  const filteredBank = useMemo(
    () => (hasPeriod ? bankData.filter((r) => r.me <= periodSerial) : bankData),
    [bankData, hasPeriod, periodSerial],
  );
  const filteredGL = useMemo(
    () => (hasPeriod ? glData.filter((r) => r.me <= periodSerial) : glData),
    [glData, hasPeriod, periodSerial],
  );

  const matches: MatchRow[] = useMemo(
    () => computeMatches(filteredBank, filteredGL),
    [filteredBank, filteredGL],
  );

  const visibleMatches = useMemo(
    () => (hideZeroReconciling ? matches.filter((m) => +(m.glAmt - m.bankAmt).toFixed(2) !== 0) : matches),
    [matches, hideZeroReconciling],
  );

  const totalBank = matches.reduce((s, m) => s + m.bankAmt, 0);
  const totalGL = matches.reduce((s, m) => s + m.glAmt, 0);
  const totalReconcilingAmount = +(
    numOrZero(bankBalanceForMonth) +
    matches.reduce((s, m) => s + (m.glAmt - m.bankAmt), 0)
  ).toFixed(2);
  const varianceToGLBalance = +(numOrZero(currentBalance) - totalReconcilingAmount).toFixed(2);

  return (
    <div className="reconciliation-subpage" style={{ marginTop: '12px' }}>
      <div className="recon-panel" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* ─── Title block ─── */}
        <div
          style={{
            padding: '24px 24px 18px',
            textAlign: 'center',
            background: 'var(--bg-surface-2)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>
            <span style={{
              display: 'inline-block',
              minWidth: '320px',
              borderBottom: '1px dashed var(--line)',
              paddingBottom: '2px',
            }}>
              [Entity Name]
            </span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink-2)', marginTop: '6px' }}>
            Bank Reconciliation
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '6px' }}>
            For the Period Ending:&nbsp;
            <span style={{
              display: 'inline-block',
              minWidth: '180px',
              borderBottom: '1px solid var(--line)',
              paddingBottom: '2px',
              color: periodEndingText ? 'var(--ink)' : 'var(--faint)',
              fontWeight: 500,
            }}>
              {periodEndingText || <>&nbsp;</>}
            </span>
          </div>
        </div>

        {/* ─── Account metadata ─── */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 40px' }}>
            {[
              { label: 'GL Account Number', value: glAccountNumber, set: setGlAccountNumber, placeholder: 'e.g. 11011113' },
              { label: 'Reviewed By', value: '', set: () => {}, placeholder: '', readOnly: true },
              { label: 'Account Description', value: accountDescription, set: setAccountDescription, placeholder: 'e.g. CASH IN BANK-FFB PHARMACY' },
              { label: 'Prepared By', value: '', set: () => {}, placeholder: '', readOnly: true },
              { label: 'Bank Name', value: bankName, set: setBankName, placeholder: 'e.g. First Financial Bank' },
              { label: 'Bank Account Number', value: bankAccountNumber, set: setBankAccountNumber, placeholder: 'e.g. XXXX1569' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, minWidth: '170px' }}>
                  {f.label}:
                </span>
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  readOnly={f.readOnly}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '13px',
                    border: '1px solid var(--line)',
                    borderRadius: '6px',
                    background: f.readOnly ? 'var(--bg-surface-2)' : 'var(--bg-surface)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ─── Balance summary ─── */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--line)' }}>
          <table className="recon-table" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '36%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className="c">Current Month</th>
                <th className="r">Prior Month</th>
                <th className="r">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="desc">GL Account Balance</td>
                <td className="c"><Amt value={currentBalance} /></td>
                <td className="r"><Amt value={priorBalance} /></td>
                <td className="r"><Amt value={balanceChange} /></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Detail support ─── */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              Detail Support for Current Month
            </div>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              color: 'var(--muted)',
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={hideZeroReconciling}
                onChange={(e) => setHideZeroReconciling(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              {hideZeroReconciling ? 'Show all transactions' : 'Show only reconciling amounts'}
            </label>
          </div>

          <table className="recon-table" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '16%' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className="r">Match #</th>
                <th>Description</th>
                <th className="r">Bank</th>
                <th className="r">GL</th>
                <th className="c">Reconciling Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {/* Bank Balance row — first row */}
              <tr>
                <td />
                <td className="desc">Bank Balance</td>
                <td />
                <td />
                <td className="c"><Amt value={bankBalanceForMonth} /></td>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={noteFor('bank-balance')}
                    onChange={(e) => setNote('bank-balance', e.target.value)}
                  />
                </td>
              </tr>
              {visibleMatches.length === 0 ? (
                <tr>
                  <td />
                  <td colSpan={4} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                    {hideZeroReconciling
                      ? 'All match rows reconcile to zero — uncheck the filter to see them.'
                      : hasPeriod
                        ? 'No transactions on or before the period ending date.'
                        : 'Select a period ending in the Month dropdown to load matches.'}
                  </td>
                  <td />
                </tr>
              ) : (
                visibleMatches.map((m) => {
                  const description = buildDescription(m);
                  const rowVariance = +(m.glAmt - m.bankAmt).toFixed(2);
                  return (
                    <tr key={m.matchNum}>
                      <td className="r mono">
                        <button
                          type="button"
                          className="link"
                          onClick={() => onMatchClick(m.matchNum)}
                          title={`View Match # ${m.matchNum} in Bank/GL`}
                        >
                          {m.matchNum}
                        </button>
                      </td>
                      <td>{description}</td>
                      <td className="r"><Amt value={m.bankAmt} /></td>
                      <td className="r"><Amt value={m.glAmt} /></td>
                      <td className={`c recon-amt ${rowVariance === 0 ? 'zero' : 'nonzero'}`}>
                        {formatAmount(rowVariance)}
                      </td>
                      <td>
                        <input
                          type="text"
                          className="cell-input"
                          value={noteFor(`match-${m.matchNum}`)}
                          onChange={(e) => setNote(`match-${m.matchNum}`, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="r"><Amt value={totalBank} /></td>
                <td className="r"><Amt value={totalGL} /></td>
                <td className="c"><Amt value={totalReconcilingAmount} /></td>
                <td />
              </tr>
              <tr className="subtotal">
                <td colSpan={2}>Variance to GL Balance</td>
                <td />
                <td />
                <td className={`c recon-amt ${varianceToGLBalance === 0 ? 'zero' : 'nonzero heavy'}`}>
                  {currentBalance === null ? '—' : formatAmount(varianceToGLBalance)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reconciliation;
