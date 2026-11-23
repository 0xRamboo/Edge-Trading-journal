import {
  Account,
  AiReport,
  AppSettings,
  BacktestSession,
  ChecklistRule,
  CsvPreset,
  DailyJournal,
  DailyPlan,
  Strategy,
  Trade,
  WeeklyPlan,
} from '../types/trading';

const DB_NAME = 'edgeledger_journal_db';
const DB_VERSION = 1;

export type StoreName =
  | 'accounts'
  | 'trades'
  | 'dailyJournals'
  | 'weeklyPlans'
  | 'dailyPlans'
  | 'checklistRules'
  | 'strategies'
  | 'backtestSessions'
  | 'csvPresets'
  | 'aiReports'
  | 'settings';

const ALL_STORES: { name: StoreName; keyPath: string }[] = [
  { name: 'accounts', keyPath: 'id' },
  { name: 'trades', keyPath: 'id' },
  { name: 'dailyJournals', keyPath: 'dateKey' },
  { name: 'weeklyPlans', keyPath: 'id' },
  { name: 'dailyPlans', keyPath: 'dateKey' },
  { name: 'checklistRules', keyPath: 'id' },
  { name: 'strategies', keyPath: 'id' },
  { name: 'backtestSessions', keyPath: 'id' },
  { name: 'csvPresets', keyPath: 'id' },
  { name: 'aiReports', keyPath: 'id' },
  { name: 'settings', keyPath: 'id' },
];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ALL_STORES) {
        if (!db.objectStoreNames.contains(s.name)) {
          const store = db.createObjectStore(s.name, { keyPath: s.keyPath });
          if (s.name === 'trades') {
            store.createIndex('accountId', 'accountId', { unique: false });
            store.createIndex('openTime', 'openTime', { unique: false });
            store.createIndex('strategyId', 'strategyId', { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function putInStore<T>(storeName: StoreName, item: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putManyInStore<T>(storeName: StoreName, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFromStore(storeName: StoreName, key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteManyFromStore(storeName: StoreName, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const k of keys) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface FullJournalBackup {
  version: number;
  exportedAt: string;
  accounts: Account[];
  trades: Trade[];
  dailyJournals: DailyJournal[];
  weeklyPlans: WeeklyPlan[];
  dailyPlans: DailyPlan[];
  checklistRules: ChecklistRule[];
  strategies: Strategy[];
  backtestSessions: BacktestSession[];
  csvPresets: CsvPreset[];
  aiReports: AiReport[];
  settings: AppSettings[];
}

export async function exportFullBackup(): Promise<FullJournalBackup> {
  const [
    accounts,
    trades,
    dailyJournals,
    weeklyPlans,
    dailyPlans,
    checklistRules,
    strategies,
    backtestSessions,
    csvPresets,
    aiReports,
    settings,
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

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
    trades,
    dailyJournals,
    weeklyPlans,
    dailyPlans,
    checklistRules,
    strategies,
    backtestSessions,
    csvPresets,
    aiReports,
    settings,
  };
}

export async function restoreFullBackup(backup: Partial<FullJournalBackup>, replaceExisting = true): Promise<void> {
  if (replaceExisting) {
    await Promise.all(ALL_STORES.map((s) => clearStore(s.name)));
  }
  await Promise.all([
    putManyInStore('accounts', backup.accounts ?? []),
    putManyInStore('trades', backup.trades ?? []),
    putManyInStore('dailyJournals', backup.dailyJournals ?? []),
    putManyInStore('weeklyPlans', backup.weeklyPlans ?? []),
    putManyInStore('dailyPlans', backup.dailyPlans ?? []),
    putManyInStore('checklistRules', backup.checklistRules ?? []),
    putManyInStore('strategies', backup.strategies ?? []),
    putManyInStore('backtestSessions', backup.backtestSessions ?? []),
    putManyInStore('csvPresets', backup.csvPresets ?? []),
    putManyInStore('aiReports', backup.aiReports ?? []),
    putManyInStore('settings', backup.settings ?? []),
  ]);
}
