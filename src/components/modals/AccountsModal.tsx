import React, { useState } from 'react';
import { Archive, ArchiveRestore, Plus, Trash2, X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { Account, AccountType, CommissionModel } from '../../types/trading';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import { AccountProgressCard } from '../ui/AccountProgressCard';

export function AccountsModal() {
  const {
    accounts,
    liveTrades,
    settings,
    accountsModalOpen,
    setAccountsModalOpen,
    saveAccount,
    deleteAccount,
    pushToast,
  } = useJournal();

  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');
  const [type, setType] = useState<AccountType>('live');
  const [startingBalance, setStartingBalance] = useState('10000');
  const [currency, setCurrency] = useState('USD');
  const [commissionModel, setCommissionModel] = useState<CommissionModel>('per_lot');
  const [commissionRate, setCommissionRate] = useState('7');
  const [showArchived, setShowArchived] = useState(false);

  if (!accountsModalOpen) return null;

  const startNew = () => {
    setEditing(null);
    setName('');
    setBroker('');
    setType('live');
    setStartingBalance('10000');
    setCurrency(settings.displayCurrency || 'USD');
    setCommissionModel('per_lot');
    setCommissionRate('7');
  };

  const startEdit = (acc: Account) => {
    setEditing(acc);
    setName(acc.name);
    setBroker(acc.broker);
    setType(acc.type);
    setStartingBalance(String(acc.startingBalance));
    setCurrency(acc.currency);
    setCommissionModel(acc.commissionModel);
    setCommissionRate(String(acc.commissionRate));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !broker.trim()) {
      pushToast('error', 'Account name and broker are required.');
      return;
    }
    const bal = parseFloat(startingBalance);
    const rate = parseFloat(commissionRate) || 0;
    if (!Number.isFinite(bal) || bal <= 0) {
      pushToast('error', 'Starting balance must be greater than 0.');
      return;
    }

    const acc: Account = {
      id: editing ? editing.id : `acc-${Date.now()}`,
      name: name.trim(),
      broker: broker.trim(),
      type,
      startingBalance: bal,
      currency,
      commissionModel,
      commissionRate: rate,
      archived: editing ? editing.archived : false,
      createdAt: editing ? editing.createdAt : new Date().toISOString(),
    };
    await saveAccount(acc);
    pushToast('success', editing ? `Updated "${acc.name}"` : `Added account "${acc.name}"`);
    startNew();
  };

  const toggleArchive = async (acc: Account) => {
    await saveAccount({ ...acc, archived: !acc.archived });
    pushToast('info', acc.archived ? `Restored "${acc.name}"` : `Archived "${acc.name}"`);
  };

  const visibleAccounts = accounts.filter((a) => (showArchived ? true : !a.archived));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Broker & Trading Accounts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage live, demo, and prop accounts across forex, crypto, and equities.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAccountsModalOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-12">
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 md:col-span-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {editing ? 'Edit Account' : 'Add Account'}
              </h3>
              {editing && (
                <button
                  type="button"
                  onClick={startNew}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. IC Markets Raw FX"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Broker / Exchange
                </label>
                <input
                  type="text"
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  placeholder="Bybit, IBKR, FTMO"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Account Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AccountType)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="live">Live</option>
                  <option value="demo">Demo</option>
                  <option value="prop">Prop Firm</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Starting Balance
                </label>
                <input
                  type="number"
                  step="any"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Commission Model
                </label>
                <select
                  value={commissionModel}
                  onChange={(e) => setCommissionModel(e.target.value as CommissionModel)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="per_lot">Per Lot ($)</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Per Trade ($)</option>
                  <option value="zero">Zero / Spread Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Rate
                </label>
                <input
                  type="number"
                  step="any"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  disabled={commissionModel === 'zero'}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {editing ? 'Save Changes' : 'Create Account'}
            </button>
          </form>

          {/* Existing Accounts List */}
          <div className="space-y-3 md:col-span-7">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Accounts ({visibleAccounts.length})
              </h3>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700"
                />
                Show archived
              </label>
            </div>

            {visibleAccounts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No accounts created yet. Add your first broker account on the left.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleAccounts.map((acc) => (
                  <div key={acc.id} className="space-y-1.5">
                    <AccountProgressCard
                      account={acc}
                      trades={liveTrades}
                      timeZone={settings.timezone}
                      onEdit={() => startEdit(acc)}
                    />
                    <div className="flex items-center justify-end gap-2 px-1">
                      <button
                        type="button"
                        onClick={() => void toggleArchive(acc)}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {acc.archived ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAccount(acc.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
