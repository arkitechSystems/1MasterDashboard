import React from 'react';
import BankRecon from './BankRecon';

type AccountingPageType = 'close-checklist' | 'journal-entries' | 'recon-checklist' | 'bank-recon' | 'reconciliations' | 'chart-of-accounts';

interface AccountingViewProps {
  currentPage: AccountingPageType;
}

const AccountingView: React.FC<AccountingViewProps> = ({ currentPage }) => {
  const renderPage = () => {
    switch (currentPage) {
      case 'bank-recon':
        return <BankRecon />;
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
