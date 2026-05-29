import React from 'react';
import BankRecon from './BankRecon';
import Form990 from './Form990';
import CashSummary from './CashSummary';
import Toolkit from './toolkit/Toolkit';

type AccountingPageType = 'close-checklist' | 'journal-entries' | 'toolkit' | 'recon-checklist' | 'cash-summary' | 'bank-recon' | 'reconciliations' | 'cost-report' | '990';

interface AccountingViewProps {
  currentPage: AccountingPageType;
}

const AccountingView: React.FC<AccountingViewProps> = ({ currentPage }) => {
  const renderPage = () => {
    switch (currentPage) {
      case 'bank-recon':
        return <BankRecon />;
      case '990':
        return <Form990 />;
      case 'cash-summary':
        return <CashSummary />;
      case 'toolkit':
        return <Toolkit />;
      default:
        return null;
    }
  };

  return (
    <main className="dashboard" role="main" aria-label="Accounting View">
      {renderPage()}
    </main>
  );
};

export default AccountingView;
