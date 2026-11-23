import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { DailyJournal } from '../../types/trading';
import { formatCurrency, formatR } from '../../utils/currency';
import { getDateKeyInTimezone } from '../../utils/timezone';

export function DayJournalDrawer() {
  const {
    journalDateDrawer,
    setJournalDateDrawer,
    filteredLiveTrades,
    dailyJournals,
    accounts,
    settings,
    saveDailyJournal,
    setDrawerTradeId,
    pushToast,
  } = useJournal();

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [sleepHours, setSleepHours] = useState('7.5');
  const [marketSummary, setMarketSummary] = useState('');
  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [lessons, setLessons] = useState('');

  const dayTrades = useMemo(() => {
    if (!journalDateDrawer) return [];
    return filteredLiveTrades.filter(
      (t) => getDateKeyInTimezone(t.closeTime || t.openTime, settings.timezone) === journalDateDrawer
    );
  }, [filteredLiveTrades, journalDateDrawer, settings.timezone]);

  const existingJournal = useMemo(
    () => dailyJournals.find((d) => d.dateKey === journalDateDrawer),
    [dailyJournals, journalDateDrawer]
  );

  useEffect(() => {
    if (!journalDateDrawer) return;
    if (existingJournal) {
      setMood(existingJournal.mood);
      setEnergy(existingJournal.energy);
      setSleepHours(String(existingJournal.sleepHours));
      setMarketSummary(existingJournal.marketSummary);
      setWentWell(existingJournal.wentWell);
      setToImprove(existingJournal.toImprove);
      setLessons(existingJournal.lessons);
    } else {
      setMood(4);
      setEnergy(4);
      setSleepHours('7.5');
      setMarketSummary('');
      setWentWell('');
      setToImprove('');
      setLessons('');
    }
  }, [journalDateDrawer, existingJournal]);

  if (!journalDateDrawer) return null;

  const dayNetPnl = dayTrades.reduce((s, t) => s + t.netPnl, 0);
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry: DailyJournal = {
      dateKey: journalDateDrawer,
      mood,
      energy,
      sleepHours: parseFloat(sleepHours) || 7,
      marketSummary,
      wentWell,
      toImprove,
      lessons,
      updatedAt: new Date().toISOString(),
    };
    await saveDailyJournal(entry);
    pushToast('success', `Saved daily journal for ${journalDateDrawer}.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
              {journalDateDrawer}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {dayTrades.length} trades · Net{' '}
              <span className={dayNetPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {formatCurrency(dayNetPnl, settings.displayCurrency, { signed: true })}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJournalDateDrawer(null)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Trades for that day */}
          <div>
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Session Executions
            </h3>
            {dayTrades.length === 0 ? (
              <p className="text-xs text-slate-500">No trades recorded on {journalDateDrawer}.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {dayTrades.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setJournalDateDrawer(null);
                      setDrawerTradeId(t.id);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {t.instrument}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">
                        {t.direction} · {accMap.get(t.accountId)?.name ?? ''}
                      </span>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums">
                      <span className={t.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {formatCurrency(t.netPnl, accMap.get(t.accountId)?.currency || 'USD', { signed: true })}
                      </span>
                      <span className="ml-2 text-slate-500">{formatR(t.actualR)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Daily Journal Form */}
          <form onSubmit={handleSave} className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daily Reflection & State
            </h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mood (1-5)</label>
                <select
                  value={mood}
                  onChange={(e) => setMood(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
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
                  value={energy}
                  onChange={(e) => setEnergy(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Sleep (hrs)</label>
                <input
                  type="number"
                  step="0.5"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
            </div>

            {[
              ['Market Summary', marketSummary, setMarketSummary, 'Key session regimes, volatility, liquidity sweeps...'],
              ['What Went Well', wentWell, setWentWell, 'Patience, sizing discipline, execution...'],
              ['What to Improve', toImprove, setToImprove, 'Late entries, hesitations, rule deviations...'],
              ['Key Lessons', lessons, setLessons, 'Actionable takeaway for tomorrow...'],
            ].map(([label, val, setter, ph]) => (
              <div key={String(label)}>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {String(label)}
                </label>
                <textarea
                  rows={2}
                  value={String(val)}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  placeholder={String(ph)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            ))}

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save Daily Journal
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
