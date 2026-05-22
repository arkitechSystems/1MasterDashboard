import React, { useState, useEffect } from 'react';
import './App.css';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import FirstLoginPasswordReset from './components/FirstLoginPasswordReset';
import MandatoryMFASetup from './components/MandatoryMFASetup';
import Screensaver from './components/Screensaver';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import AccountingSidebar from './components/AccountingSidebar';
import Dashboard from './components/Dashboard';
import AccountingView from './components/AccountingView';
import IncomeStatementTwo from './components/IncomeStatementTwo';
import MDA from './components/MDA';
import TrendedIS from './components/TrendedIS';
import BalanceSheetTrend from './components/BalanceSheetTrend';
import BalanceSheetActivity from './components/BalanceSheetActivity';
import Settings from './components/Settings';
import UserGuide from './components/UserGuide';
import MVA from './components/MVA';
import ImpactPreview from './components/ImpactPreview';
import AIChatWindow from './components/AIChatWindow';
import UpcomingModules from './components/UpcomingModules';
import ProForma from './components/ProForma';
import GLTransactions from './components/GLTransactions';
import ProjectionsImp from './components/ProjectionsImp';
import MyAccount from './components/MyAccount';
import MonthlyReportOptions from './components/MonthlyReportOptions';
import SubmitTicket from './components/SubmitTicket';
import TrendedIS2 from './components/TrendedIS2';
import HiddenLinks from './components/HiddenLinks';
import { API_ENDPOINTS } from './config';

type PageType = 'dashboard' | 'income-two' | 'mda' | 'balance-trend' | 'balance-activity' | 'settings' | 'test-trend' | 'mva' | 'impact-preview' | 'projections-imp' | 'user-guide' | 'pro-forma' | 'gl-transactions' | 'upcoming-modules' | 'my-account' | 'monthly-report-options' | 'submit-ticket' | 'trended-is2';

type AccountingPageType = 'close-checklist' | 'journal-entries' | 'recon-checklist' | 'reconciliations' | 'chart-of-accounts';

function AppContent() {
  const { isAuthenticated, firstLogin, passwordResetRequired, completeFirstLogin, showScreensaver, dismissScreensaver } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [currentView, setCurrentView] = useState<'dashboard' | 'accounting'>('dashboard');
  const [accountingPage, setAccountingPage] = useState<AccountingPageType>('close-checklist');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showHiddenLinks, setShowHiddenLinks] = useState(false);
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);
  const [mfaSetupComplete, setMfaSetupComplete] = useState(false);

  // Keyboard shortcut handler for Ctrl+H+M
  useEffect(() => {
    if (!isAuthenticated || showScreensaver) return;

    const keysPressed = new Set<string>();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.key) return;
      keysPressed.add(event.key.toLowerCase());

      // Check if Ctrl + H + M are all pressed
      if (event.ctrlKey && keysPressed.has('h') && keysPressed.has('m')) {
        event.preventDefault();
        setShowHiddenLinks((prev) => !prev);
        keysPressed.clear(); // Clear after triggering
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.key) return;
      keysPressed.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isAuthenticated, showScreensaver]);

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Handle first login flow
  if (firstLogin && passwordResetRequired && !passwordResetComplete) {
    return (
      <FirstLoginPasswordReset
        onComplete={() => setPasswordResetComplete(true)}
      />
    );
  }

  // After password reset, require MFA setup
  if (firstLogin && passwordResetComplete && !mfaSetupComplete) {
    return (
      <MandatoryMFASetup
        onComplete={async () => {
          setMfaSetupComplete(true);
          // Mark first login as complete
          const token = localStorage.getItem('authToken');
          try {
            await fetch(`${API_ENDPOINTS.BASE_URL}/api/auth/complete-first-login`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            completeFirstLogin();
          } catch (error) {
            console.error('Failed to complete first login:', error);
          }
        }}
      />
    );
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'income-two':
        return <IncomeStatementTwo />;
      case 'mda':
        return <MDA />;
      case 'balance-trend':
        return <BalanceSheetTrend />;
      case 'balance-activity':
        return <BalanceSheetActivity />;
      case 'settings':
        return <Settings />;
      case 'test-trend':
        return <TrendedIS />;
      case 'mva':
        return <MVA />;
      case 'impact-preview':
        return <ImpactPreview />;
      case 'projections-imp':
        return <ProjectionsImp />;
      case 'user-guide':
        return <UserGuide />;
      case 'pro-forma':
        return <ProForma />;
      case 'gl-transactions':
        return <GLTransactions />;
      case 'upcoming-modules':
        return <UpcomingModules />;
      case 'my-account':
        return <MyAccount />;
      case 'monthly-report-options':
        return <MonthlyReportOptions />;
      case 'submit-ticket':
        return <SubmitTicket />;
      case 'trended-is2':
        return <TrendedIS2 />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {currentView === 'dashboard' ? (
        <Sidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          collapsed={sidebarCollapsed}
          onAIChat={() => setShowAIChat(!showAIChat)}
          showAIChat={showAIChat}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      ) : (
        <AccountingSidebar
          currentPage={accountingPage}
          onPageChange={setAccountingPage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      <Header
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onCollapseSidebar={() => setSidebarCollapsed(true)}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      <main className="content">
        {currentView === 'dashboard' ? renderContent() : <AccountingView />}
        <footer className="app-footer">
          <p>Developed by ArkiTech Systems © {new Date().getFullYear()}</p>
        </footer>
      </main>

      {/* AI Chat Window */}
      {showAIChat && (
        <AIChatWindow onClose={() => setShowAIChat(false)} />
      )}

      {/* Hidden Links Modal */}
      {showHiddenLinks && (
        <HiddenLinks
          onPageChange={setCurrentPage}
          onClose={() => setShowHiddenLinks(false)}
        />
      )}

      {/* Screensaver */}
      {showScreensaver && (
        <Screensaver
          onDismiss={dismissScreensaver}
        />
      )}
    </div>
  );
}

// Main App component with authentication
const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </AuthProvider>
  );
};

export default App;