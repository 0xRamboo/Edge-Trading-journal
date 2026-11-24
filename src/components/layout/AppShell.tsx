import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Brain,
  Calendar,
  CalendarRange,
  CheckSquare,
  Compass,
  Database,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  Sun,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { DateRangePreset, PageId } from '../../types/trading';
import { OfflineIndicator, PWAInstallButton } from '../ui/PWAInstallButton';

const NAV_ITEMS: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'weekly-plan', label: 'Weekly Plan', icon: CalendarRange },
  { id: 'daily-plan', label: 'Daily Plan', icon: Calendar },
  { id: 'checklist', label: 'Checklist / Rules', icon: CheckSquare },
  { id: 'backtesting', label: 'Backtesting', icon: FlaskConical },
  { id: 'strategy', label: 'Strategy', icon: Compass },
  { id: 'ai-analyser', label: 'AI Analyser', icon: Brain },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    activePage,
    setActivePage,
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    dateRange,
    setDateRangePreset,
    setCustomDateRange,
    settings,
    toggleTheme,
    openTradeModal,
    openImportModal,
    setAccountsModalOpen,
    setSettingsModalOpen,
    toasts,
  } = useJournal();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeAccounts = accounts.filter((a) => !a.archived);
  const currentTitle = NAV_ITEMS.find((n) => n.id === activePage)?.label ?? 'Dashboard';

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#0C1220] border-r border-slate-200 dark:border-slate-800/90">
      <div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800/90">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            EdgeLedger
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-1 text-slate-500 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-0.5 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActivePage(item.id);
                  setMobileNavOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-1 border-t border-slate-200 dark:border-slate-800/90 p-3">
        <button
          type="button"
          onClick={() => {
            openImportModal('csv');
            setMobileNavOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>Import CSV / PDF / Image</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setAccountsModalOpen(true);
            setMobileNavOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <Wallet className="h-4 w-4 shrink-0" />
          <span>Accounts ({activeAccounts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSettingsModalOpen(true);
            setMobileNavOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <Database className="h-4 w-4 shrink-0" />
          <span>Data, Backup & Settings</span>
        </button>
        <PWAInstallButton variant="sidebar" />
        <div className="px-3 pt-2 text-[11px] font-mono text-slate-400 truncate">
          {settings.displayCurrency} · {settings.timezone}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block no-print">{sidebarContent}</aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden no-print">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/90 bg-white/95 dark:bg-[#0C1220]/95 px-4 py-3 backdrop-blur-xs sm:px-6 no-print">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg whitespace-nowrap">
              {currentTitle}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Account Filter */}
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              aria-label="Filter by account"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Accounts</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>

            {/* Date Range Filter */}
            <select
              value={dateRange.preset}
              onChange={(e) => {
                const v = e.target.value as DateRangePreset;
                if (v === 'custom') {
                  setCustomDateRange(dateRange.startDate || '2026-01-01', dateRange.endDate || '2026-12-31');
                } else {
                  setDateRangePreset(v);
                }
              }}
              aria-label="Filter by date range"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7D</option>
              <option value="30d">Last 30D</option>
              <option value="90d">Last 90D</option>
              <option value="ytd">YTD</option>
              <option value="custom">Custom</option>
            </select>

            {dateRange.preset === 'custom' && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setCustomDateRange(e.target.value, dateRange.endDate)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                />
                <span className="text-xs text-slate-400">–</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setCustomDateRange(dateRange.startDate, e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                />
              </div>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => void toggleTheme()}
              aria-label="Toggle dark or light theme"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton variant="header" />

            {/* Quick-Add Trade CTA */}
            <button
              type="button"
              onClick={() => openTradeModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Trade
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">{children}</main>
      </div>

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 no-print">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-lg border px-4 py-2.5 text-xs font-medium shadow-lg ${
                t.type === 'error'
                  ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'
                  : t.type === 'success'
                  ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
      <OfflineIndicator />
    </div>
  );
}
