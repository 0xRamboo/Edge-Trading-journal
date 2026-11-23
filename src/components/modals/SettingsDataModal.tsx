import React, { useRef, useState } from 'react';
import { Database, Download, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import { SUPPORTED_TIMEZONES } from '../../utils/timezone';

export function SettingsDataModal() {
  const {
    settings,
    settingsModalOpen,
    setSettingsModalOpen,
    updateSettings,
    loadDemoData,
    clearAllUserData,
    exportAllCsv,
    exportAllJson,
    importJsonBackup,
    pushToast,
    trades,
    accounts,
  } = useJournal();

  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!settingsModalOpen) return null;

  const handleBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importJsonBackup(text);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to import JSON backup.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Preferences & Data Backup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All journal data persists locally in your browser IndexedDB ({trades.length} trades · {accounts.length} accounts).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-6">
          {/* Locale & Currency */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Currency & Timezone
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Display Currency
                </label>
                <select
                  value={settings.displayCurrency}
                  onChange={(e) => void updateSettings({ displayCurrency: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Journal Timezone
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => void updateSettings({ timezone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Export / Import */}
          <section className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Export & Restore
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={exportAllCsv}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => void exportAllJson()}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Database className="h-4 w-4" /> Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Upload className="h-4 w-4" /> Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFile}
                className="hidden"
              />
            </div>
          </section>

          {/* Demo & Reset */}
          <section className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Demo Dataset & Reset
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void loadDemoData()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> Load Demo Data (~150 Trades)
              </button>

              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-900/60 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="h-4 w-4" /> Clear All Data
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await clearAllUserData();
                      setConfirmClear(false);
                    }}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Confirm Delete Everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
