import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearStore,
  deleteFromStore,
  deleteManyFromStore,
  exportFullBackup,
  FullJournalBackup,
  getAllFromStore,
  putInStore,
  putManyInStore,
  restoreFullBackup,
} from '../db/indexedDb';
import {
  Account,
  AiReport,
  AppSettings,
  BacktestSession,
  ChecklistRule,
  CsvPreset,
  DailyJournal,
  DailyPlan,
  DateRangeFilter,
  DateRangePreset,
  PageId,
  Strategy,
  Trade,
  WeeklyPlan,
} from '../types/trading';
import { downloadTextFile, exportTradesToCsv } from '../utils/csvExport';
import { DEFAULT_CHECKLIST_RULES, generateDemoDataset } from '../utils/demoData';
import { getDateKeyInTimezone, getTodayKeyInTimezone, shiftDateKey } from '../utils/timezone';

const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  displayCurrency: 'USD',
  timezone: 'Asia/Kathmandu',
  theme: 'dark',
  hardRiskRules: {
    maxRiskPerTradePct: 1.5,
    maxDailyLoss: 1000,
    maxTradesPerDay: 4,
  },
};

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface JournalContextValue {
  loading: boolean;
  activePage: PageId;
  setActivePage: (p: PageId) => void;
  accounts: Account[];
  trades: Trade[];
  liveTrades: Trade[];
  filteredLiveTrades: Trade[];
  dailyJournals: DailyJournal[];
  weeklyPlans: WeeklyPlan[];
  dailyPlans: DailyPlan[];
  checklistRules: ChecklistRule[];
  strategies: Strategy[];
  backtestSessions: BacktestSession[];
  csvPresets: CsvPreset[];
  aiReports: AiReport[];
  settings: AppSettings;

  // Global Filters
  selectedAccountId: string; // 'ALL' or accountId
  setSelectedAccountId: (id: string) => void;
  dateRange: DateRangeFilter;
  setDateRangePreset: (preset: DateRangePreset) => void;
  setCustomDateRange: (startDate: string, endDate: string) => void;

  // Modals & Drawers
  tradeModalState: { open: boolean; editTrade?: Trade | null; backtestSessionId?: string | null };
  openTradeModal: (editTrade?: Trade | null, backtestSessionId?: string | null) => void;
  closeTradeModal: () => void;

  importModalState: { open: boolean; initialTab: 'csv' | 'screenshot'; backtestSessionId?: string | null };
  openImportModal: (tab?: 'csv' | 'screenshot', backtestSessionId?: string | null) => void;
  closeImportModal: () => void;

  accountsModalOpen: boolean;
  setAccountsModalOpen: (open: boolean) => void;
  settingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;

  drawerTradeId: string | null;
  setDrawerTradeId: (id: string | null) => void;

  journalDateDrawer: string | null;
  setJournalDateDrawer: (dateKey: string | null) => void;

  // CRUD
  saveAccount: (acc: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  saveTrade: (trade: Trade) => Promise<void>;
  saveTradesBulk: (trades: Trade[]) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  deleteTradesBulk: (ids: string[]) => Promise<void>;
  saveDailyJournal: (entry: DailyJournal) => Promise<void>;
  saveWeeklyPlan: (plan: WeeklyPlan) => Promise<void>;
  saveDailyPlan: (plan: DailyPlan) => Promise<void>;
  saveChecklistRule: (rule: ChecklistRule) => Promise<void>;
  deleteChecklistRule: (id: string) => Promise<void>;
  saveStrategy: (strategy: Strategy) => Promise<void>;
  deleteStrategy: (id: string) => Promise<void>;
  saveBacktestSession: (session: BacktestSession) => Promise<void>;
  deleteBacktestSession: (id: string) => Promise<void>;
  saveCsvPreset: (preset: CsvPreset) => Promise<void>;
  saveAiReport: (report: AiReport) => Promise<void>;
  deleteAiReport: (id: string) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  toggleTheme: () => Promise<void>;

  // Data Management
  loadDemoData: () => Promise<void>;
  clearAllUserData: () => Promise<void>;
  exportAllCsv: () => void;
  exportAllJson: () => Promise<void>;
  importJsonBackup: (jsonText: string) => Promise<void>;

  // Notifications
  toasts: ToastMessage[];
  pushToast: (type: ToastMessage['type'], text: string) => void;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function useJournal() {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used inside JournalProvider');
  return ctx;
}

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<PageId>('dashboard');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyJournals, setDailyJournals] = useState<DailyJournal[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);
  const [dailyPlans, setDailyPlans] = useState<DailyPlan[]>([]);
  const [checklistRules, setChecklistRules] = useState<ChecklistRule[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtestSessions, setBacktestSessions] = useState<BacktestSession[]>([]);
  const [csvPresets, setCsvPresets] = useState<CsvPreset[]>([]);
  const [aiReports, setAiReports] = useState<AiReport[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRangeFilter>({
    preset: 'all',
    startDate: '',
    endDate: '',
  });

  const [tradeModalState, setTradeModalState] = useState<{
    open: boolean;
    editTrade?: Trade | null;
    backtestSessionId?: string | null;
  }>({ open: false });

  const [importModalState, setImportModalState] = useState<{
    open: boolean;
    initialTab: 'csv' | 'screenshot';
    backtestSessionId?: string | null;
  }>({ open: false, initialTab: 'csv' });

  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [drawerTradeId, setDrawerTradeId] = useState<string | null>(null);
  const [journalDateDrawer, setJournalDateDrawer] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const hydrateFromDb = useCallback(async () => {
    setLoading(true);
    try {
      const [
        accs,
        trs,
        djs,
        wps,
        dps,
        rules,
        strats,
        bts,
        presets,
        reports,
        sett,
      ] = await Promise.all([
        getAllFromStore<Account>('accounts'),
        getAllFromStore<Trade>('trades'),
        getAllFromStore<DailyJournal>('dailyJournals'),
        getAllFromStore<WeeklyPlan>('weeklyPlans'),
        getAllFromStore<DailyPlan>('dailyPlans'),
        getAllFromStore<ChecklistRule>('checklistRules'),
        getAllFromStore<Strategy>('strategies'),
        getAllFromStore<BacktestSession>('backtestSessions'),
        getAllFromStore<CsvPreset>('csvPresets'),
        getAllFromStore<AiReport>('aiReports'),
        getAllFromStore<AppSettings>('settings'),
      ]);

      setAccounts(accs);
      setTrades(trs);
      setDailyJournals(djs);
      setWeeklyPlans(wps);
      setDailyPlans(dps);

      if (rules.length === 0) {
        await putManyInStore('checklistRules', DEFAULT_CHECKLIST_RULES);
        setChecklistRules(DEFAULT_CHECKLIST_RULES);
      } else {
        setChecklistRules(rules.slice().sort((a, b) => a.order - b.order));
      }

      setStrategies(strats);
      setBacktestSessions(bts);
      setCsvPresets(presets);
      setAiReports(reports.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      if (sett.length === 0) {
        await putInStore('settings', DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
      } else {
        setSettings(sett[0]);
      }
    } catch (err) {
      console.error('Failed to load IndexedDB:', err);
      pushToast('error', 'Failed to read browser storage.');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void hydrateFromDb();
  }, [hydrateFromDb]);

  const setDateRangePreset = useCallback(
    (preset: DateRangePreset) => {
      const today = getTodayKeyInTimezone(settings.timezone);
      if (preset === 'all') {
        setDateRange({ preset: 'all', startDate: '', endDate: '' });
      } else if (preset === '7d') {
        setDateRange({ preset: '7d', startDate: shiftDateKey(today, -6), endDate: today });
      } else if (preset === '30d') {
        setDateRange({ preset: '30d', startDate: shiftDateKey(today, -29), endDate: today });
      } else if (preset === '90d') {
        setDateRange({ preset: '90d', startDate: shiftDateKey(today, -89), endDate: today });
      } else if (preset === 'ytd') {
        setDateRange({ preset: 'ytd', startDate: `${today.slice(0, 4)}-01-01`, endDate: today });
      }
    },
    [settings.timezone]
  );

  const setCustomDateRange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ preset: 'custom', startDate, endDate });
  }, []);

  const liveTrades = useMemo(() => trades.filter((t) => !t.isBacktest), [trades]);

  const filteredLiveTrades = useMemo(() => {
    return liveTrades.filter((t) => {
      if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) return false;
      if (dateRange.preset !== 'all') {
        const dk = getDateKeyInTimezone(t.openTime, settings.timezone);
        if (dateRange.startDate && dk < dateRange.startDate) return false;
        if (dateRange.endDate && dk > dateRange.endDate) return false;
      }
      return true;
    });
  }, [liveTrades, selectedAccountId, dateRange, settings.timezone]);

  const openTradeModal = useCallback((editTrade?: Trade | null, backtestSessionId?: string | null) => {
    setTradeModalState({ open: true, editTrade: editTrade ?? null, backtestSessionId: backtestSessionId ?? null });
  }, []);

  const closeTradeModal = useCallback(() => {
    setTradeModalState({ open: false, editTrade: null, backtestSessionId: null });
  }, []);

  const openImportModal = useCallback((tab: 'csv' | 'screenshot' = 'csv', backtestSessionId?: string | null) => {
    setImportModalState({ open: true, initialTab: tab, backtestSessionId: backtestSessionId ?? null });
  }, []);

  const closeImportModal = useCallback(() => {
    setImportModalState((prev) => ({ ...prev, open: false }));
  }, []);

  // CRUD methods
  const saveAccount = useCallback(async (acc: Account) => {
    await putInStore('accounts', acc);
    setAccounts((prev) => {
      const exists = prev.some((a) => a.id === acc.id);
      return exists ? prev.map((a) => (a.id === acc.id ? acc : a)) : [...prev, acc];
    });
  }, []);

  const deleteAccount = useCallback(async (id: string) => {
    await deleteFromStore('accounts', id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (selectedAccountId === id) setSelectedAccountId('ALL');
  }, [selectedAccountId]);

  const saveTrade = useCallback(async (trade: Trade) => {
    await putInStore('trades', trade);
    setTrades((prev) => {
      const exists = prev.some((t) => t.id === trade.id);
      return exists ? prev.map((t) => (t.id === trade.id ? trade : t)) : [trade, ...prev];
    });
  }, []);

  const saveTradesBulk = useCallback(async (newTrades: Trade[]) => {
    await putManyInStore('trades', newTrades);
    setTrades((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      for (const nt of newTrades) map.set(nt.id, nt);
      return Array.from(map.values());
    });
  }, []);

  const deleteTrade = useCallback(async (id: string) => {
    await deleteFromStore('trades', id);
    setTrades((prev) => prev.filter((t) => t.id !== id));
    if (drawerTradeId === id) setDrawerTradeId(null);
  }, [drawerTradeId]);

  const deleteTradesBulk = useCallback(async (ids: string[]) => {
    await deleteManyFromStore('trades', ids);
    const idSet = new Set(ids);
    setTrades((prev) => prev.filter((t) => !idSet.has(t.id)));
    if (drawerTradeId && idSet.has(drawerTradeId)) setDrawerTradeId(null);
  }, [drawerTradeId]);

  const saveDailyJournal = useCallback(async (entry: DailyJournal) => {
    await putInStore('dailyJournals', entry);
    setDailyJournals((prev) => {
      const exists = prev.some((d) => d.dateKey === entry.dateKey);
      return exists ? prev.map((d) => (d.dateKey === entry.dateKey ? entry : d)) : [...prev, entry];
    });
  }, []);

  const saveWeeklyPlan = useCallback(async (plan: WeeklyPlan) => {
    await putInStore('weeklyPlans', plan);
    setWeeklyPlans((prev) => {
      const exists = prev.some((w) => w.id === plan.id);
      return exists ? prev.map((w) => (w.id === plan.id ? plan : w)) : [...prev, plan];
    });
  }, []);

  const saveDailyPlan = useCallback(async (plan: DailyPlan) => {
    await putInStore('dailyPlans', plan);
    setDailyPlans((prev) => {
      const exists = prev.some((d) => d.dateKey === plan.dateKey);
      return exists ? prev.map((d) => (d.dateKey === plan.dateKey ? plan : d)) : [...prev, plan];
    });
  }, []);

  const saveChecklistRule = useCallback(async (rule: ChecklistRule) => {
    await putInStore('checklistRules', rule);
    setChecklistRules((prev) => {
      const exists = prev.some((r) => r.id === rule.id);
      const next = exists ? prev.map((r) => (r.id === rule.id ? rule : r)) : [...prev, rule];
      return next.sort((a, b) => a.order - b.order);
    });
  }, []);

  const deleteChecklistRule = useCallback(async (id: string) => {
    await deleteFromStore('checklistRules', id);
    setChecklistRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const saveStrategy = useCallback(async (strategy: Strategy) => {
    await putInStore('strategies', strategy);
    setStrategies((prev) => {
      const exists = prev.some((s) => s.id === strategy.id);
      return exists ? prev.map((s) => (s.id === strategy.id ? strategy : s)) : [...prev, strategy];
    });
  }, []);

  const deleteStrategy = useCallback(async (id: string) => {
    await deleteFromStore('strategies', id);
    setStrategies((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const saveBacktestSession = useCallback(async (session: BacktestSession) => {
    await putInStore('backtestSessions', session);
    setBacktestSessions((prev) => {
      const exists = prev.some((b) => b.id === session.id);
      return exists ? prev.map((b) => (b.id === session.id ? session : b)) : [...prev, session];
    });
  }, []);

  const deleteBacktestSession = useCallback(async (id: string) => {
    await deleteFromStore('backtestSessions', id);
    const sessionTradeIds = trades.filter((t) => t.backtestSessionId === id).map((t) => t.id);
    if (sessionTradeIds.length > 0) {
      await deleteManyFromStore('trades', sessionTradeIds);
      const idSet = new Set(sessionTradeIds);
      setTrades((prev) => prev.filter((t) => !idSet.has(t.id)));
    }
    setBacktestSessions((prev) => prev.filter((b) => b.id !== id));
  }, [trades]);

  const saveCsvPreset = useCallback(async (preset: CsvPreset) => {
    await putInStore('csvPresets', preset);
    setCsvPresets((prev) => {
      const exists = prev.some((p) => p.id === preset.id);
      return exists ? prev.map((p) => (p.id === preset.id ? preset : p)) : [...prev, preset];
    });
  }, []);

  const saveAiReport = useCallback(async (report: AiReport) => {
    await putInStore('aiReports', report);
    setAiReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
  }, []);

  const deleteAiReport = useCallback(async (id: string) => {
    await deleteFromStore('aiReports', id);
    setAiReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const next = { ...settings, ...partial, id: 'default' };
      await putInStore('settings', next);
      setSettings(next);
    },
    [settings]
  );

  const toggleTheme = useCallback(async () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    await updateSettings({ theme: nextTheme });
  }, [settings.theme, updateSettings]);

  const loadDemoData = useCallback(async () => {
    const demo = generateDemoDataset(settings.timezone);
    await restoreFullBackup(
      {
        accounts: demo.accounts,
        strategies: demo.strategies,
        checklistRules: demo.checklistRules,
        trades: demo.trades,
        dailyJournals: demo.dailyJournals,
        weeklyPlans: demo.weeklyPlans,
        dailyPlans: demo.dailyPlans,
        backtestSessions: demo.backtestSessions,
        settings: [settings],
      },
      true
    );
    await hydrateFromDb();
    setSelectedAccountId('ALL');
    setDateRange({ preset: 'all', startDate: '', endDate: '' });
    pushToast('success', 'Loaded 152 live trades, 36 backtest trades, 4 accounts, and playbooks.');
  }, [settings, hydrateFromDb, pushToast]);

  const clearAllUserData = useCallback(async () => {
    await Promise.all([
      clearStore('accounts'),
      clearStore('trades'),
      clearStore('dailyJournals'),
      clearStore('weeklyPlans'),
      clearStore('dailyPlans'),
      clearStore('strategies'),
      clearStore('backtestSessions'),
      clearStore('aiReports'),
    ]);
    await hydrateFromDb();
    setSelectedAccountId('ALL');
    pushToast('info', 'All journal data cleared.');
  }, [hydrateFromDb, pushToast]);

  const exportAllCsv = useCallback(() => {
    const csv = exportTradesToCsv(trades, accounts, strategies, settings.timezone);
    downloadTextFile(csv, `edgeledger-trades-${getTodayKeyInTimezone(settings.timezone)}.csv`, 'text/csv;charset=utf-8;');
    pushToast('success', `Exported ${trades.length} trades to CSV.`);
  }, [trades, accounts, strategies, settings.timezone, pushToast]);

  const exportAllJson = useCallback(async () => {
    const backup = await exportFullBackup();
    downloadTextFile(
      JSON.stringify(backup, null, 2),
      `edgeledger-backup-${getTodayKeyInTimezone(settings.timezone)}.json`,
      'application/json'
    );
    pushToast('success', 'Full IndexedDB backup exported to JSON.');
  }, [settings.timezone, pushToast]);

  const importJsonBackup = useCallback(
    async (jsonText: string) => {
      const parsed = JSON.parse(jsonText) as Partial<FullJournalBackup>;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.trades)) {
        throw new Error('Invalid backup JSON structure.');
      }
      await restoreFullBackup(parsed, true);
      await hydrateFromDb();
      pushToast('success', `Restored backup (${parsed.trades.length} trades).`);
    },
    [hydrateFromDb, pushToast]
  );

  const value: JournalContextValue = {
    loading,
    activePage,
    setActivePage,
    accounts,
    trades,
    liveTrades,
    filteredLiveTrades,
    dailyJournals,
    weeklyPlans,
    dailyPlans,
    checklistRules,
    strategies,
    backtestSessions,
    csvPresets,
    aiReports,
    settings,
    selectedAccountId,
    setSelectedAccountId,
    dateRange,
    setDateRangePreset,
    setCustomDateRange,
    tradeModalState,
    openTradeModal,
    closeTradeModal,
    importModalState,
    openImportModal,
    closeImportModal,
    accountsModalOpen,
    setAccountsModalOpen,
    settingsModalOpen,
    setSettingsModalOpen,
    drawerTradeId,
    setDrawerTradeId,
    journalDateDrawer,
    setJournalDateDrawer,
    saveAccount,
    deleteAccount,
    saveTrade,
    saveTradesBulk,
    deleteTrade,
    deleteTradesBulk,
    saveDailyJournal,
    saveWeeklyPlan,
    saveDailyPlan,
    saveChecklistRule,
    deleteChecklistRule,
    saveStrategy,
    deleteStrategy,
    saveBacktestSession,
    deleteBacktestSession,
    saveCsvPreset,
    saveAiReport,
    deleteAiReport,
    updateSettings,
    toggleTheme,
    loadDemoData,
    clearAllUserData,
    exportAllCsv,
    exportAllJson,
    importJsonBackup,
    toasts,
    pushToast,
  };

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}
