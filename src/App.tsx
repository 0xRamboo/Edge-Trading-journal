import React from 'react';
import { DayJournalDrawer } from './components/drawers/DayJournalDrawer';
import { TradeDetailDrawer } from './components/drawers/TradeDetailDrawer';
import { AppShell } from './components/layout/AppShell';
import { AccountsModal } from './components/modals/AccountsModal';
import { SettingsDataModal } from './components/modals/SettingsDataModal';
import { TradeEntryModal } from './components/modals/TradeEntryModal';
import { TradeImportModal } from './components/modals/TradeImportModal';
import { JournalProvider, useJournal } from './context/JournalContext';
import { AiAnalyserPage } from './pages/AiAnalyserPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { BacktestingPage } from './pages/BacktestingPage';
import { ChecklistPage } from './pages/ChecklistPage';
import { DailyPlanPage } from './pages/DailyPlanPage';
import { DashboardPage } from './pages/DashboardPage';
import { JournalPage } from './pages/JournalPage';
import { StrategyPage } from './pages/StrategyPage';
import { WeeklyPlanPage } from './pages/WeeklyPlanPage';

function ActivePageView() {
  const { activePage, loading } = useJournal();

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
      </div>
    );
  }

  switch (activePage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'journal':
      return <JournalPage />;
    case 'analysis':
      return <AnalysisPage />;
    case 'weekly-plan':
      return <WeeklyPlanPage />;
    case 'daily-plan':
      return <DailyPlanPage />;
    case 'checklist':
      return <ChecklistPage />;
    case 'backtesting':
      return <BacktestingPage />;
    case 'strategy':
      return <StrategyPage />;
    case 'ai-analyser':
      return <AiAnalyserPage />;
    default:
      return <DashboardPage />;
  }
}

export default function App() {
  return (
    <JournalProvider>
      <AppShell>
        <ActivePageView />
      </AppShell>
      <TradeEntryModal />
      <TradeImportModal />
      <AccountsModal />
      <SettingsDataModal />
      <TradeDetailDrawer />
      <DayJournalDrawer />
    </JournalProvider>
  );
}
