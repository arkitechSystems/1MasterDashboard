import React from 'react';

type PageType = 'dashboard' | 'income-two' | 'mda' | 'balance-trend' | 'balance-activity' | 'settings' | 'test-trend' | 'mva' | 'impact-preview' | 'projections-imp' | 'user-guide' | 'pro-forma' | 'gl-transactions' | 'upcoming-modules' | 'my-account' | 'monthly-report-options' | 'submit-ticket' | 'trended-is2';

interface SidebarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  collapsed: boolean;
  onAIChat: () => void;
  showAIChat: boolean;
  onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, collapsed, onAIChat, showAIChat, onToggleCollapse }) => {
  const navItemsBeforeAI = [
    { page: 'dashboard' as PageType, icon: 'dashboard', label: 'Dashboard' },
    { page: 'income-two' as PageType, icon: 'description', label: 'Income Statement' },
    { page: 'mda' as PageType, icon: 'article', label: 'MD&A' },
    { page: 'test-trend' as PageType, icon: 'bar_chart', label: 'Trended IS' },
    { page: 'mva' as PageType, icon: 'analytics', label: 'MVA' },
    { page: 'impact-preview' as PageType, icon: 'preview', label: 'Impact Preview' },
    { page: 'projections-imp' as PageType, icon: 'trending_up', label: 'Projections' },
    { page: 'balance-trend' as PageType, icon: 'account_balance', label: 'Balance Sheet Trend' },
    { page: 'balance-activity' as PageType, icon: 'insights', label: 'Balance Sheet Activity' },
    { page: 'gl-transactions' as PageType, icon: 'receipt_long', label: 'GL Transactions' },
    { page: 'trended-is2' as PageType, icon: 'bar_chart', label: 'Trended IS2' },
  ];

  const navItemsAfterAI = [
    { page: 'settings' as PageType, icon: 'settings', label: 'Settings' },
    { page: 'user-guide' as PageType, icon: 'help', label: 'User Guide' },
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
        {navItemsBeforeAI.map((item) => (
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

        {/* Ask AI Tab */}
        <li className={showAIChat ? 'active' : ''}>
          <span
            className={`nav-item ai-chat-trigger ${showAIChat ? 'chat-active' : ''}`}
            onClick={onAIChat}
            title="Ask AI"
          >
            <span className="material-symbols-outlined">text_fields_alt</span>
            <span className="label">Ask AI</span>
            {collapsed && <span className="tooltip">Ask AI</span>}
          </span>
        </li>

        {navItemsAfterAI.map((item) => (
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

export default Sidebar;