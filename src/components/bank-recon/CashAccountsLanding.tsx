/**
 * Cash-accounts landing — the first screen of the Bank Reconciliation
 * area. Lists every GL account mapped to a Cash / Cash Equivalents /
 * Short-term Investments BS line in the Setup. Clicking an account drills
 * the parent BankRecon into the full recon flow (Reconciliation /
 * Matches / Bank-GL / Balances / Upload / AI Recon) scoped to that
 * account.
 */

import React, { useEffect, useState } from 'react';
import { CashAccount, fetchCashAccounts } from '../../services/cashAccounts';
import { saveBankMappings } from '../../services/setupApi';

interface CashAccountsLandingProps {
  selectedMonth: string;
  onSelectAccount: (acct: CashAccount) => void;
}

const CashAccountsLanding: React.FC<CashAccountsLandingProps> = ({
  selectedMonth,
  onSelectAccount,
}) => {
  const [accounts, setAccounts] = useState<CashAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // GL # currently saving

  useEffect(() => {
    let cancelled = false;
    fetchCashAccounts()
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load cash accounts');
      });
    return () => {
      cancelled = false;
    };
  }, []);

  const updateRow = <K extends keyof CashAccount>(
    idx: number,
    key: K,
    value: CashAccount[K],
  ) => {
    setAccounts((prev) =>
      prev ? prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)) : prev,
    );
  };

  const persistBank = async (acct: CashAccount) => {
    if (acct.source !== 'setup') return; // gldet fallback can't persist
    setSaving(acct.gl);
    try {
      await saveBankMappings([
        {
          account: acct.gl,
          bank: acct.bank,
          bankAccountNumber: acct.bankAccountNumber,
        },
      ]);
    } catch (e) {
      // Surface the error inline rather than blocking the UI.
      console.error('Failed to save bank mapping', e);
    } finally {
      setSaving(null);
    }
  };

  if (error) {
    return (
      <div className="cash-landing-error">
        <span className="material-icons">error_outline</span>
        <p>{error}</p>
      </div>
    );
  }

  if (accounts === null) {
    return (
      <div className="cash-landing-empty">
        <p>Loading cash accounts…</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="cash-landing-empty">
        <span className="material-icons">info</span>
        <p>
          No cash accounts found. Open <strong>Setup</strong> and tag at least
          one Chart-of-Accounts row to a BS line labelled "Cash",
          "Cash &amp; Cash Equivalents", or "Short-term Investments".
        </p>
      </div>
    );
  }

  return (
    <div className="cash-landing">
      <div className="cash-landing-header">
        <div>
          <h2>Cash Accounts</h2>
          <p className="cash-landing-sub">
            Click <strong>Reconcile</strong> on any account to open its bank
            reconciliation. Bank name and account number persist to the
            chart of accounts when you tab out of the field.
          </p>
        </div>
        {selectedMonth && (
          <div className="cash-landing-month">
            Period:&nbsp;<strong>{selectedMonth}</strong>
          </div>
        )}
      </div>

      <table className="cash-landing-table">
        <thead>
          <tr>
            <th>GL</th>
            <th>GL Description</th>
            <th>Balance Sheet Category</th>
            <th>Bank</th>
            <th>Account #</th>
            <th aria-label="Action" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a, i) => (
            <tr key={a.gl}>
              <td className="mono">{a.gl}</td>
              <td>{a.description}</td>
              <td className="muted">{a.category}</td>
              <td>
                <input
                  type="text"
                  className="cash-landing-input"
                  value={a.bank}
                  placeholder={a.source === 'gldet' ? '(setup required)' : '—'}
                  disabled={a.source === 'gldet'}
                  onChange={(e) => updateRow(i, 'bank', e.target.value)}
                  onBlur={() => persistBank(a)}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="cash-landing-input"
                  value={a.bankAccountNumber}
                  placeholder={a.source === 'gldet' ? '(setup required)' : '—'}
                  disabled={a.source === 'gldet'}
                  onChange={(e) => updateRow(i, 'bankAccountNumber', e.target.value)}
                  onBlur={() => persistBank(a)}
                />
              </td>
              <td className="cash-landing-action">
                <button
                  type="button"
                  className="cash-landing-reconcile"
                  onClick={() => onSelectAccount(a)}
                >
                  {saving === a.gl ? 'Saving…' : 'Reconcile'}
                  <span className="material-icons">arrow_forward</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CashAccountsLanding;
