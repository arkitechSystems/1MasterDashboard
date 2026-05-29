import React from 'react';

type PageType = 'dashboard' | 'income-two' | 'mda' | 'balance-trend' | 'balance-activity' | 'settings' | 'test-trend' | 'mva' | 'impact-preview' | 'projections-imp' | 'user-guide' | 'pro-forma' | 'gl-transactions' | 'upcoming-modules' | 'my-account' | 'monthly-report-options' | 'submit-ticket' | 'admin' | 'questionnaire';

interface HiddenLinksProps {
  onPageChange: (page: PageType) => void;
  onClose: () => void;
}

const HiddenLinks: React.FC<HiddenLinksProps> = ({ onPageChange, onClose }) => {
  const hiddenPages = [
    { page: 'pro-forma' as PageType, icon: 'calculate', label: 'Pro Forma', description: 'Financial projections and forecasting' },
    { page: 'upcoming-modules' as PageType, icon: 'rocket_launch', label: 'Upcoming Modules', description: 'Preview of features in development' },
  ];

  const handlePageClick = (page: PageType) => {
    onPageChange(page);
    onClose();
  };

  return (
    <div className="hidden-links-overlay" onClick={onClose}>
      <div className="hidden-links-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hidden-links-header">
          <h2>Hidden Pages</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <span className="material-icons">close</span>
          </button>
        </div>
        <div className="hidden-links-content">
          <p className="hidden-links-description">
            These pages are hidden from the main sidebar but can be accessed here.
          </p>
          <div className="hidden-links-list">
            {hiddenPages.map((item) => (
              <div
                key={item.page}
                className="hidden-link-card"
                onClick={() => handlePageClick(item.page)}
              >
                <div className="hidden-link-icon">
                  <span className="material-icons">{item.icon}</span>
                </div>
                <div className="hidden-link-info">
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                </div>
                <div className="hidden-link-arrow">
                  <span className="material-icons">arrow_forward</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden-links-footer">
            <p className="keyboard-hint">
              <span className="material-icons">keyboard</span>
              Press <kbd>Ctrl+H+M</kbd> to toggle this menu
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HiddenLinks;
