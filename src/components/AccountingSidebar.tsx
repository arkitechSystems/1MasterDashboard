import React from 'react';

type PageType = 'close-checklist' | 'journal-entries' | 'toolkit' | 'recon-checklist' | 'cash-summary' | 'bank-recon' | 'reconciliations' | 'cost-report' | '990';

interface AccountingSidebarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const AccountingSidebar: React.FC<AccountingSidebarProps> = ({
  currentPage,
  onPageChange,
  collapsed,
  onToggleCollapse
}) => {
  const navItems = [
    { page: 'close-checklist' as PageType, icon: 'checklist', label: 'Close Checklist' },
    { page: 'journal-entries' as PageType, icon: 'receipt_long', label: 'Journal Entries' },
    { page: 'toolkit' as PageType, icon: 'handyman', label: 'Toolkit' },
    { page: 'recon-checklist' as PageType, icon: 'fact_check', label: 'Recon Checklist' },
    { page: 'cash-summary' as PageType, icon: 'savings', label: 'Cash Summary' },
    { page: 'bank-recon' as PageType, icon: 'account_balance_wallet', label: 'Bank Recon' },
    { page: 'reconciliations' as PageType, icon: 'account_balance', label: 'Reconciliations' },
    { page: 'cost-report' as PageType, icon: 'request_quote', label: 'Cost Report' },
    { page: '990' as PageType, icon: 'description', label: 'Form 990' },
  ];

  return (
    <aside className="sidebar">
      <button
        className="sidebar-toggle"
        aria-label="Toggle sidebar"
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
      >
        <span className="material-icons">menu</span>
      </button>

      <div className="sidebar-header">
        <span className="material-icons">local_hospital</span>
        <strong>Financial Nav</strong>
      </div>

      <hr className="sidebar-divider" />

      <ol>
        {navItems.map((item) => (
          <li key={item.page} className={currentPage === item.page ? 'active' : ''}>
            <span
              className="nav-item"
              onClick={() => onPageChange(item.page)}
              title={item.label}
            >
              <span className="material-icons">{item.icon}</span>
              <span className="label">{item.label}</span>
              {collapsed && <span className="tooltip">{item.label}</span>}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
};

export default AccountingSidebar;
