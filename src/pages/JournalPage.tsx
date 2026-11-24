import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search, Tag, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useJournal } from '../context/JournalContext';
import { DailyJournal, Trade } from '../types/trading';
import { hasValidStopLoss } from '../utils/calculations';
import { formatCurrency, formatR } from '../utils/currency';
import { formatDateTimeInTimezone, formatHoldingTime, getTodayKeyInTimezone } from '../utils/timezone';

type SortKey = 'openTime' | 'instrument' | 'netPnl' | 'actualR' | 'holdingTimeMinutes';

export function JournalPage() {
  const {
    accounts,
    strategies,
    filteredLiveTrades,
    dailyJournals,
    settings,
    setDrawerTradeId,
    saveTradesBulk,
    deleteTradesBulk,
    saveDailyJournal,
    pushToast,
  } = useJournal();

  // Search & filters
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('ALL');
  const [filterStrategy, setFilterStrategy] = useState('ALL');
  const [filterSession, setFilterSession] = useState('ALL');
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS' | 'OPEN'>('ALL');
  const [filterRules, setFilterRules] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [filterTag, setFilterTag] = useState('');

  // Sorting & Pagination (scales cleanly to 10,000+ trades)
  const [sortKey, setSortKey] = useState<SortKey>('openTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState('');

  // Daily Journal inline panel
  const [journalDate, setJournalDate] = useState(getTodayKeyInTimezone(settings.timezone));
  const existingDj = dailyJournals.find((d) => d.dateKey === journalDate);
  const [djMood, setDjMood] = useState<1 | 2 | 3 | 4 | 5>(existingDj?.mood ?? 4);
  const [djEnergy, setDjEnergy] = useState<1 | 2 | 3 | 4 | 5>(existingDj?.energy ?? 4);
  const [djSleep, setDjSleep] = useState(String(existingDj?.sleepHours ?? 7.5));
  const [djSummary, setDjSummary] = useState(existingDj?.marketSummary ?? '');
  const [djWell, setDjWell] = useState(existingDj?.wentWell ?? '');
  const [djImprove, setDjImprove] = useState(existingDj?.toImprove ?? '');
  const [djLessons, setDjLessons] = useState(existingDj?.lessons ?? '');

  React.useEffect(() => {
    const found = dailyJournals.find((d) => d.dateKey === journalDate);
    setDjMood(found?.mood ?? 4);
    setDjEnergy(found?.energy ?? 4);
    setDjSleep(String(found?.sleepHours ?? 7.5));
    setDjSummary(found?.marketSummary ?? '');
    setDjWell(found?.wentWell ?? '');
    setDjImprove(found?.toImprove ?? '');
    setDjLessons(found?.lessons ?? '');
  }, [journalDate, dailyJournals]);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const strategiesMap = useMemo(() => new Map(strategies.map((s) => [s.id, s])), [strategies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagQ = filterTag.trim().toLowerCase();

    const list = filteredLiveTrades.filter((t) => {
      if (filterAccount !== 'ALL' && t.accountId !== filterAccount) return false;
      if (filterStrategy !== 'ALL' && t.strategyId !== filterStrategy) return false;
      if (filterSession !== 'ALL' && t.session !== filterSession) return false;
      if (filterResult === 'WIN' && !(t.status !== 'OPEN' && t.netPnl > 0)) return false;
      if (filterResult === 'LOSS' && !(t.status !== 'OPEN' && t.netPnl < 0)) return false;
      if (filterResult === 'OPEN' && t.status !== 'OPEN') return false;
      if (filterRules === 'YES' && !t.rulesFollowed) return false;
      if (filterRules === 'NO' && t.rulesFollowed) return false;
      if (tagQ) {
        const allTags = [...t.mistakeTags, ...t.customTags].map((x) => x.toLowerCase());
        if (!allTags.some((x) => x.includes(tagQ))) return false;
      }
      if (q) {
        const hay = `${t.instrument} ${t.setup} ${t.notes} ${strategiesMap.get(t.strategyId)?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'openTime') cmp = new Date(a.openTime).getTime() - new Date(b.openTime).getTime();
      else if (sortKey === 'instrument') cmp = a.instrument.localeCompare(b.instrument);
      else if (sortKey === 'netPnl') cmp = a.netPnl - b.netPnl;
      else if (sortKey === 'actualR') {
        const ra = hasValidStopLoss(a) && a.actualR !== null ? a.actualR : -Infinity;
        const rb = hasValidStopLoss(b) && b.actualR !== null ? b.actualR : -Infinity;
        cmp = ra - rb;
      }
      else if (sortKey === 'holdingTimeMinutes') cmp = a.holdingTimeMinutes - b.holdingTimeMinutes;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    filteredLiveTrades,
    search,
    filterAccount,
    filterStrategy,
    filterSession,
    filterResult,
    filterRules,
    filterTag,
    sortKey,
    sortDir,
    strategiesMap,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage]
  );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const toggleSelectAllPage = () => {
    const allSelected = pageRows.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const handleBulkTag = async () => {
    const tag = bulkTagInput.trim();
    if (!tag || selectedIds.size === 0) return;
    const toUpdate: Trade[] = [];
    for (const t of filteredLiveTrades) {
      if (selectedIds.has(t.id) && !t.customTags.includes(tag)) {
        toUpdate.push({ ...t, customTags: [...t.customTags, tag], updatedAt: new Date().toISOString() });
      }
    }
    if (toUpdate.length > 0) await saveTradesBulk(toUpdate);
    setBulkTagInput('');
    pushToast('success', `Tagged ${toUpdate.length} trades with #${tag}.`);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    await deleteTradesBulk(Array.from(selectedIds));
    setSelectedIds(new Set());
    pushToast('info', 'Deleted selected trades.');
  };

  const handleSaveDailyJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry: DailyJournal = {
      dateKey: journalDate,
      mood: djMood,
      energy: djEnergy,
      sleepHours: parseFloat(djSleep) || 7,
      marketSummary: djSummary,
      wentWell: djWell,
      toImprove: djImprove,
      lessons: djLessons,
      updatedAt: new Date().toISOString(),
    };
    await saveDailyJournal(entry);
    pushToast('success', `Saved daily journal for ${journalDate}.`);
  };

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search symbol, setup, notes..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            value={filterAccount}
            onChange={(e) => {
              setFilterAccount(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
          >
            <option value="ALL">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={filterStrategy}
            onChange={(e) => {
              setFilterStrategy(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
          >
            <option value="ALL">All Strategies</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filterSession}
            onChange={(e) => {
              setFilterSession(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
          >
            <option value="ALL">All Sessions</option>
            <option value="Asia">Asia</option>
            <option value="London">London</option>
            <option value="Overlap">Overlap</option>
            <option value="New York">New York</option>
          </select>
          <div className="flex gap-2">
            <select
              value={filterResult}
              onChange={(e) => {
                setFilterResult(e.target.value as typeof filterResult);
                setPage(1);
              }}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-xs"
            >
              <option value="ALL">All Results</option>
              <option value="WIN">Winners</option>
              <option value="LOSS">Losers</option>
              <option value="OPEN">Open</option>
            </select>
            <select
              value={filterRules}
              onChange={(e) => {
                setFilterRules(e.target.value as typeof filterRules);
                setPage(1);
              }}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-xs"
            >
              <option value="ALL">All Rules</option>
              <option value="YES">Rules Followed</option>
              <option value="NO">Rules Broken</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filterTag}
              onChange={(e) => {
                setFilterTag(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by mistake/custom tag..."
              className="w-52 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
            />
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {filtered.length} matching trades
            </span>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400">
                {selectedIds.size} selected
              </span>
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Tag name"
                className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleBulkTag()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Tag className="h-3.5 w-3.5" /> Apply Tag
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trade Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No matching trades found"
          description="Adjust your search/filter parameters or log a new trade to populate your journal ledger."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAllPage}
                    />
                  </th>
                  <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => toggleSort('openTime')}>
                    Open Time {sortKey === 'openTime' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => toggleSort('instrument')}>
                    Instrument {sortKey === 'instrument' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-3 py-3 font-medium">Account</th>
                  <th className="px-3 py-3 font-medium">Side</th>
                  <th className="px-3 py-3 font-medium">Setup / Strategy</th>
                  <th className="px-3 py-3 font-medium">Session</th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer" onClick={() => toggleSort('holdingTimeMinutes')}>
                    Hold {sortKey === 'holdingTimeMinutes' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer" onClick={() => toggleSort('actualR')}>
                    R {sortKey === 'actualR' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer" onClick={() => toggleSort('netPnl')}>
                    Net P&L {sortKey === 'netPnl' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-3 py-3 font-medium">Discipline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {pageRows.map((t) => {
                  const acc = accountsMap.get(t.accountId);
                  const strat = strategiesMap.get(t.strategyId);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setDrawerTradeId(t.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() =>
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTimeInTimezone(t.openTime, settings.timezone)}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {t.instrument}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {acc?.name ?? '—'}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono font-medium whitespace-nowrap ${
                          t.direction === 'LONG' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.direction}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 max-w-[180px] truncate">
                        {[t.setup, strat?.name].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {t.session}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatHoldingTime(t.holdingTimeMinutes)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                          !hasValidStopLoss(t) || t.actualR === null
                            ? 'text-slate-400 dark:text-slate-500'
                            : t.actualR >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatR(hasValidStopLoss(t) ? t.actualR : null)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                          t.status === 'OPEN'
                            ? 'text-slate-500'
                            : t.netPnl >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.status === 'OPEN'
                          ? 'OPEN'
                          : formatCurrency(t.netPnl, acc?.currency || 'USD', { signed: true })}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <span className={t.rulesFollowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                          {t.rulesFollowed ? 'Followed' : 'Broken'}
                        </span>
                        {t.mistakeTags.length > 0 && (
                          <span className="ml-1.5 text-slate-400">· {t.mistakeTags.join(', ')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Page {safePage} of {totalPages} ({filtered.length} trades)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Journal Entry Section */}
      <form
        onSubmit={handleSaveDailyJournal}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Journal Entry</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track psychology, energy, market narrative, and daily process lessons.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={journalDate}
              onChange={(e) => setJournalDate(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Save Daily Entry
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mood (1-5)</label>
            <select
              value={djMood}
              onChange={(e) => setDjMood(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Energy (1-5)</label>
            <select
              value={djEnergy}
              onChange={(e) => setDjEnergy(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sleep (Hours)</label>
            <input
              type="number"
              step="0.5"
              value={djSleep}
              onChange={(e) => setDjSleep(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Market Summary</label>
            <textarea
              rows={2}
              value={djSummary}
              onChange={(e) => setDjSummary(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">What Went Well</label>
            <textarea
              rows={2}
              value={djWell}
              onChange={(e) => setDjWell(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">What to Improve</label>
            <textarea
              rows={2}
              value={djImprove}
              onChange={(e) => setDjImprove(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Lessons</label>
            <textarea
              rows={2}
              value={djLessons}
              onChange={(e) => setDjLessons(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
          </div>
        </div>
      </form>
    </div>
  );
}
