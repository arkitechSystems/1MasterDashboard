import React from 'react';

type PageType = 'close-checklist' | 'journal-entries' | 'recon-checklist' | 'reconciliations' | 'chart-of-accounts';

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
    { page: 'recon-checklist' as PageType, icon: 'fact_check', label: 'Recon Checklist' },
    { page: 'reconciliations' as PageType, icon: 'account_balance', label: 'Reconciliations' },
    { page: 'chart-of-accounts' as PageType, icon: 'account_tree', label: 'Chart of Accounts' },
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
