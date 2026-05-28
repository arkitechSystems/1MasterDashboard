import React, { useState, useEffect } from 'react';
import './App.css';
import { SettingsProvider } from './contexts/SettingsContext';
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
import Admin from './components/Admin';
import Questionnaire from './components/Questionnaire';
import HiddenLinks from './components/HiddenLinks';

type PageType = 'dashboard' | 'income-two' | 'mda' | 'balance-trend' | 'balance-activity' | 'settings' | 'test-trend' | 'mva' | 'impact-preview' | 'projections-imp' | 'user-guide' | 'pro-forma' | 'gl-transactions' | 'upcoming-modules' | 'my-account' | 'monthly-report-options' | 'submit-ticket' | 'admin' | 'questionnaire';

type AccountingPageType = 'close-checklist' | 'journal-entries' | 'recon-checklist' | 'cash-summary' | 'bank-recon' | 'reconciliations' | 'cost-report' | '990';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [currentView, setCurrentView] = useState<'dashboard' | 'accounting'>('dashboard');
  const [accountingPage, setAccountingPage] = useState<AccountingPageType>('close-checklist');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showHiddenLinks, setShowHiddenLinks] = useState(false);

  useEffect(() => {
    const keysPressed = new Set<string>();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.key) return;
      keysPressed.add(event.key.toLowerCase());

      if (event.ctrlKey && keysPressed.has('h') && keysPressed.has('m')) {
        event.preventDefault();
        setShowHiddenLinks((prev) => !prev);
        keysPressed.clear();
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
  }, []);

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
      case 'admin':
        return <Admin />;
      case 'questionnaire':
        return <Questionnaire />;
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
        {currentView === 'dashboard' ? renderContent() : <AccountingView currentPage={accountingPage} />}
        <footer className="app-footer">
          <p>Developed by ArkiTech Systems © {new Date().getFullYear()}</p>
        </footer>
      </main>

      {showAIChat && (
        <AIChatWindow onClose={() => setShowAIChat(false)} />
      )}

      {showHiddenLinks && (
        <HiddenLinks
          onPageChange={setCurrentPage}
          onClose={() => setShowHiddenLinks(false)}
        />
      )}
    </div>
  );
}

const App: React.FC = () => {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
};

export default App;
