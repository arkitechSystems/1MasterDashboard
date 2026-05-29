import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';
import { useAuth } from '../auth/useAuth';

type PageType = 'dashboard' | 'income-two' | 'mda' | 'balance-trend' | 'balance-activity' | 'settings' | 'test-trend' | 'mva' | 'impact-preview' | 'projections-imp' | 'user-guide' | 'pro-forma' | 'gl-transactions' | 'upcoming-modules' | 'my-account' | 'monthly-report-options' | 'submit-ticket' | 'admin' | 'questionnaire';

interface SearchResult {
  label: string;
  type: 'navigation' | 'action';
  action: () => void;
}

interface HeaderProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
  onCollapseSidebar?: () => void;
  currentView?: 'dashboard' | 'accounting';
  onViewChange?: (view: 'dashboard' | 'accounting') => void;
}

interface Notification {
  id: number;
  title: string;
  description: string;
  timestamp: string;
  isRead: boolean;
}

const Header: React.FC<HeaderProps> = ({ currentPage, onPageChange, onCollapseSidebar, currentView = 'dashboard', onViewChange }) => {
  const {
    authConfigured,
    user: authUser,
    memberships,
    activeTenant,
    isSuperAdmin,
    switchTenant,
    logout,
  } = useAuth();

  const userName = authUser?.name || authUser?.email || 'Admin';
  const userTitle = activeTenant?.tenantName
    || (isSuperAdmin ? 'Super Admin' : 'CFO');
  const showTenantSwitcher = authConfigured && (memberships.length > 1 || isSuperAdmin);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefreshDate, setLastRefreshDate] = useState<string>('Loading...');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      title: 'Data Refresh Completed',
      description: 'All financial data has been updated successfully',
      timestamp: 'October 30, 2025',
      isRead: false
    },
    {
      id: 2,
      title: 'Monthly Report Ready',
      description: 'September 2025 financial report is available for review',
      timestamp: '2 hours ago',
      isRead: false
    },
    {
      id: 3,
      title: 'Budget Variance Alert',
      description: 'Department 5105 exceeded budget by 12%',
      timestamp: '5 hours ago',
      isRead: false
    }
  ]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const [displayedView, setDisplayedView] = useState<'dashboard' | 'accounting'>(currentView);
  const [titleCollapsed, setTitleCollapsed] = useState(false);

  useEffect(() => {
    if (currentView === displayedView) return;
    setTitleCollapsed(true);
    const swap = window.setTimeout(() => {
      setDisplayedView(currentView);
      // next frame, release the collapse so the new title expands
      window.requestAnimationFrame(() => setTitleCollapsed(false));
    }, 220);
    return () => window.clearTimeout(swap);
  }, [currentView, displayedView]);

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase();
  };

  const handleMyAccount = () => {
    console.log('Navigate to My Account');
    onPageChange?.('my-account' as PageType);
    setSearchQuery('');
    setShowResults(false);
  };

  const handleMonthlyReport = () => {
    console.log('Navigate to Monthly Report Options');
    onPageChange?.('monthly-report-options' as PageType);
    setSearchQuery('');
    setShowResults(false);
  };

  const handleSubmitTicket = () => {
    console.log('Navigate to Submit a Ticket');
    onPageChange?.('submit-ticket' as PageType);
  };

  const handleAdmin = () => {
    console.log('Navigate to Admin');
    onPageChange?.('admin' as PageType);
  };

  const handleQuestionnaire = () => {
    onPageChange?.('questionnaire' as PageType);
  };

  const handleNotificationClick = (notificationId: number) => {
    setNotifications(prevNotifications =>
      prevNotifications.map(notification =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification
      )
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      searchResults[0].action();
    }
  };

  // Fullscreen toggle function
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      // Enter fullscreen and collapse sidebar
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      // Collapse the sidebar when entering fullscreen
      if (onCollapseSidebar) {
        onCollapseSidebar();
      }
    } else {
      // Exit fullscreen (no effect on sidebar)
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Fetch metadata to get the last refresh date
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          console.error('No authentication token found');
          return;
        }

        const response = await fetch(API_ENDPOINTS.GL_METADATA, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const metadata = await response.json();
          const lastModifiedDate = new Date(metadata.lastModified);
          setLastRefreshDate(lastModifiedDate.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }));
        } else {
          setLastRefreshDate('10/13/2025 04:43PM');
        }
      } catch (error) {
        console.error('Error fetching metadata:', error);
        setLastRefreshDate('10/13/2025 04:43PM');
      }
    };

    fetchMetadata();

    // Refresh metadata every 30 seconds to catch updates
    const interval = setInterval(fetchMetadata, 30000);

    return () => clearInterval(interval);
  }, []);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const notificationWrapper = document.querySelector('.notification-icon-wrapper');

      if (showNotifications && notificationWrapper && !notificationWrapper.contains(target)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  // Define all searchable items
  const searchableItems: SearchResult[] = [
    { label: 'Dashboard', type: 'navigation', action: () => onPageChange?.('dashboard' as PageType) },
    { label: 'Income Statement', type: 'navigation', action: () => onPageChange?.('income-two' as PageType) },
    { label: 'Trended IS', type: 'navigation', action: () => onPageChange?.('test-trend' as PageType) },
    { label: 'MVA', type: 'navigation', action: () => onPageChange?.('mva' as PageType) },
    { label: 'Impact Preview', type: 'navigation', action: () => onPageChange?.('impact-preview' as PageType) },
    { label: 'Projections', type: 'navigation', action: () => onPageChange?.('projections-imp' as PageType) },
    { label: 'Balance Sheet Trend', type: 'navigation', action: () => onPageChange?.('balance-trend' as PageType) },
    { label: 'Balance Sheet Activity', type: 'navigation', action: () => onPageChange?.('balance-activity' as PageType) },
    { label: 'GL Transactions', type: 'navigation', action: () => onPageChange?.('gl-transactions' as PageType) },
    { label: 'Settings', type: 'navigation', action: () => onPageChange?.('settings' as PageType) },
    { label: 'User Guide', type: 'navigation', action: () => onPageChange?.('user-guide' as PageType) },
    { label: 'Pro Forma', type: 'navigation', action: () => onPageChange?.('pro-forma' as PageType) },
    { label: 'Upcoming Modules', type: 'navigation', action: () => onPageChange?.('upcoming-modules' as PageType) },
    { label: 'My Account', type: 'action', action: handleMyAccount },
  ];

  // Filter search results based on query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      setShowResults(false);
    } else {
      const filtered = searchableItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(filtered);
      setShowResults(filtered.length > 0);
    }
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult) => {
    result.action();
    setSearchQuery('');
    setShowResults(false);
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <img
            src={`${process.env.PUBLIC_URL}/ArkiTech.png`}
            alt="ArkiTech Logo"
            className="header-logo"
            title="Developed by ArkiTech Systems © 2025"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h1 className={`header-title ${titleCollapsed ? 'collapsed' : ''}`}>
            <span className="header-title-inner">
              {displayedView === 'accounting' ? 'Accounting Dashboard' : 'Financial Dashboard'}
            </span>
          </h1>
          <div className={`header-search-wrapper ${searchQuery ? 'has-text' : ''}`}>
            <form className="header-search" onSubmit={handleSearch}>
              <button
                type="button"
                className="search-icon-btn"
                aria-label="Focus search"
                onClick={() => {
                  const el = document.querySelector<HTMLInputElement>('.search-input');
                  el?.focus();
                }}
              >
                <span className="material-icons">search</span>
              </button>
              <input
                type="text"
                className="search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
              />
            </form>
            {showResults && (
              <div className="search-results">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="search-result-item"
                    onClick={() => handleResultClick(result)}
                  >
                    <span className="material-icons result-icon">
                      {result.type === 'navigation' ? 'arrow_forward' : 'person'}
                    </span>
                    <span className="result-label">{result.label}</span>
                    <span className="result-type">{result.type === 'navigation' ? 'Page' : 'Action'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <span className="header-refresh-date" style={{
            fontSize: '13px',
            color: '#666',
            marginRight: '15px',
            fontStyle: 'italic'
          }}>
            Last Refresh Date: {lastRefreshDate}
          </span>
          <span className="header-date">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </span>
          <button
            className="fullscreen-button"
            onClick={toggleFullscreen}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              marginLeft: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f0f0f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            title={isFullscreen ? "Exit Fullscreen (F11)" : "Enter Fullscreen (F11)"}
          >
            <span className="material-icons" style={{ fontSize: '24px', color: '#666', transition: 'color 0.2s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#666';
              }}
            >
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
          <div className="notification-icon-wrapper" style={{ position: 'relative', marginLeft: '5px' }}>
            <button
              className="notification-button"
              onClick={() => setShowNotifications(!showNotifications)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f0f0f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="Notifications"
            >
              <span className="material-icons" style={{ fontSize: '24px', color: '#666', transition: 'color 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#333';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#666';
                }}
              >
                notifications
              </span>
              {unreadCount > 0 && (
                <span
                  className="notification-badge"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: '#e74c3c',
                    color: 'white',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div
                className="notifications-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '8px',
                  background: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  minWidth: '320px',
                  maxWidth: '400px',
                  zIndex: 1000
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #eee',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: '#333'
                  }}
                >
                  Notifications
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="notification-item"
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f5f5f5',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        background: notification.isRead ? '#fafafa' : 'white',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f9f9f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = notification.isRead ? '#fafafa' : 'white')}
                      onClick={() => handleNotificationClick(notification.id)}
                    >
                      {!notification.isRead && (
                        <span
                          style={{
                            position: 'absolute',
                            left: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#3498db'
                          }}
                        />
                      )}
                      <div style={{
                        fontWeight: notification.isRead ? '400' : '500',
                        fontSize: '13px',
                        color: notification.isRead ? '#666' : '#333',
                        marginBottom: '4px',
                        marginLeft: !notification.isRead ? '16px' : '0'
                      }}>
                        {notification.title}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#666',
                        marginLeft: !notification.isRead ? '16px' : '0'
                      }}>
                        {notification.description}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#999',
                        marginTop: '4px',
                        marginLeft: !notification.isRead ? '16px' : '0'
                      }}>
                        {notification.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    padding: '10px 16px',
                    textAlign: 'center',
                    borderTop: '1px solid #eee',
                    fontSize: '13px',
                    color: '#3498db',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                  onClick={() => setShowNotifications(false)}
                >
                  View All Notifications
                </div>
              </div>
            )}
          </div>
          <div className="user-profile-wrapper">
            <div className="user-profile">
              <div className="user-avatar">
                {getInitials(userName)}
              </div>
              <div className="user-info">
                <div className="user-name">{userName}</div>
                <div className="user-title">{userTitle}</div>
              </div>
            </div>
            <div className="user-dropdown">
              {showTenantSwitcher && (
                <div className="dropdown-section">
                  <div className="dropdown-section-label">
                    <span className="material-icons">business</span>
                    <span>Tenant</span>
                  </div>
                  {memberships.map((m) => (
                    <div
                      key={m.tenantId}
                      className={`dropdown-item ${activeTenant?.tenantId === m.tenantId ? 'active' : ''}`}
                      onClick={() => switchTenant(m.tenantId)}
                      title={`Role: ${m.role}`}
                    >
                      <span className="material-icons">
                        {activeTenant?.tenantId === m.tenantId ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                      <span>{m.tenantName}</span>
                    </div>
                  ))}
                  <div className="dropdown-divider" />
                </div>
              )}
              <div
                className="dropdown-item"
                onClick={() => onViewChange?.(currentView === 'dashboard' ? 'accounting' : 'dashboard')}
              >
                <span className="material-icons">swap_horiz</span>
                <span>{currentView === 'dashboard' ? 'Accounting View' : 'Dashboard View'}</span>
              </div>
              <div className="dropdown-item" onClick={handleMyAccount}>
                <span className="material-icons">person</span>
                <span>My Account</span>
              </div>
              <div className="dropdown-item" onClick={handleMonthlyReport}>
                <span className="material-icons">description</span>
                <span>Monthly Report</span>
              </div>
              <div className="dropdown-item" onClick={handleSubmitTicket}>
                <span className="material-icons">support</span>
                <span>Submit a Ticket</span>
              </div>
              <div className="dropdown-item" onClick={handleAdmin}>
                <span className="material-icons">admin_panel_settings</span>
                <span>Setup</span>
              </div>
              <div className="dropdown-item" onClick={handleQuestionnaire}>
                <span className="material-icons">fact_check</span>
                <span>Questionnaire</span>
              </div>
              {authConfigured && (
                <>
                  <div className="dropdown-divider" />
                  <div className="dropdown-item" onClick={logout}>
                    <span className="material-icons">logout</span>
                    <span>Sign out</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
