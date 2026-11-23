import React, { useEffect, useMemo, useState } from 'react';
import { Compass, Plus, Trash2, Upload } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useJournal } from '../context/JournalContext';
import { Strategy, StrategyStatus } from '../types/trading';
import { buildBreakdown, calculatePerformance } from '../utils/calculations';
import { formatCurrency, formatR } from '../utils/currency';

export function StrategyPage() {
  const {
    accounts,
    strategies,
    trades,
    filteredLiveTrades,
    settings,
    saveStrategy,
    deleteStrategy,
    setDrawerTradeId,
    pushToast,
  } = useJournal();

  const [selectedId, setSelectedId] = useState<string>(strategies[0]?.id ?? '');
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => (creating ? null : strategies.find((s) => s.id === selectedId) ?? strategies[0] ?? null),
    [creating, strategies, selectedId]
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [marketConditions, setMarketConditions] = useState('');
  const [entryRules, setEntryRules] = useState('');
  const [exitRules, setExitRules] = useState('');
  const [riskRules, setRiskRules] = useState('');
  const [invalidation, setInvalidation] = useState('');
  const [status, setStatus] = useState<StrategyStatus>('Testing');
  const [versionNotes, setVersionNotes] = useState('');
  const [exampleScreenshots, setExampleScreenshots] = useState<string[]>([]);

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setDescription(selected.description);
      setMarketConditions(selected.marketConditions);
      setEntryRules(selected.entryRules);
      setExitRules(selected.exitRules);
      setRiskRules(selected.riskRules);
      setInvalidation(selected.invalidation);
      setStatus(selected.status);
      setVersionNotes(selected.versionNotes);
      setExampleScreenshots(selected.exampleScreenshots ?? []);
    } else if (creating) {
      setName('');
      setDescription('');
      setMarketConditions('');
      setEntryRules('');
      setExitRules('');
      setRiskRules('');
      setInvalidation('');
      setStatus('Testing');
      setVersionNotes('v1.0');
      setExampleScreenshots([]);
    }
  }, [selected, creating]);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cur = settings.displayCurrency;

  // Comparison across all strategies
  const allStrategyComparison = useMemo(() => {
    return strategies.map((s) => {
      const sLive = filteredLiveTrades.filter((t) => t.strategyId === s.id);
      const sBt = trades.filter((t) => t.isBacktest && t.strategyId === s.id);
      const livePerf = calculatePerformance(sLive, 10000, accountsMap, cur, settings.timezone).metrics;
      const btPerf = calculatePerformance(sBt, 10000, accountsMap, cur, settings.timezone).metrics;
      return { strategy: s, livePerf, btPerf };
    });
  }, [strategies, filteredLiveTrades, trades, accountsMap, cur, settings.timezone]);

  const selectedStats = useMemo(() => {
    if (!selected) return null;
    const sLive = filteredLiveTrades.filter((t) => t.strategyId === selected.id);
    const sBt = trades.filter((t) => t.isBacktest && t.strategyId === selected.id);
    const livePerf = calculatePerformance(sLive, 10000, accountsMap, cur, settings.timezone).metrics;
    const btPerf = calculatePerformance(sBt, 10000, accountsMap, cur, settings.timezone).metrics;
    const byCondition = buildBreakdown(sLive, (t) => t.marketCondition || 'Unspecified', accountsMap, cur);
    const bestCond = byCondition[0] ?? null;
    const worstCond = byCondition.length > 1 ? byCondition[byCondition.length - 1] : null;
    return { sLive, livePerf, btPerf, bestCond, worstCond };
  }, [selected, filteredLiveTrades, trades, accountsMap, cur, settings.timezone]);

  const handleUploadExample = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setExampleScreenshots((prev) => [...prev.slice(0, 3), reader.result as string]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const obj: Strategy = {
      id: selected && !creating ? selected.id : `strat-${Date.now()}`,
      name: name.trim(),
      description,
      marketConditions,
      entryRules,
      exitRules,
      riskRules,
      invalidation,
      status,
      versionNotes,
      exampleScreenshots,
      createdAt: selected && !creating ? selected.createdAt : now,
      updatedAt: now,
    };
    await saveStrategy(obj);
    setCreating(false);
    setSelectedId(obj.id);
    pushToast('success', `Saved strategy "${obj.name}".`);
  };

  if (strategies.length === 0 && !creating) {
    return (
      <EmptyState
        icon={Compass}
        title="No strategy playbooks defined"
        description="Document your setups, entry triggers, invalidation rules, and risk sizing to measure true edge across live and backtest data."
        primaryActionLabel="Create Strategy Playbook"
        onPrimaryAction={() => setCreating(true)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {strategies.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setCreating(false);
                setSelectedId(s.id);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                !creating && selected?.id === s.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {s.name} · <span className="opacity-75">{s.status}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> New Strategy
        </button>
      </div>

      {/* Strategy Playbook Form & Stats */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 lg:col-span-7"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {creating ? 'New Strategy Playbook' : 'Playbook Specification'}
            </h3>
            {selected && !creating && (
              <button
                type="button"
                onClick={() => void deleteStrategy(selected.id)}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Strategy Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StrategyStatus)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="Testing">Testing</option>
                <option value="Live">Live</option>
                <option value="Retired">Retired</option>
              </select>
            </div>
          </div>

          {[
            ['Description', description, setDescription],
            ['Ideal Market Conditions', marketConditions, setMarketConditions],
            ['Entry Rules', entryRules, setEntryRules],
            ['Exit Rules', exitRules, setExitRules],
            ['Risk Sizing Rules', riskRules, setRiskRules],
            ['Invalidation Criteria', invalidation, setInvalidation],
            ['Version Notes', versionNotes, setVersionNotes],
          ].map(([label, val, setter]) => (
            <div key={String(label)}>
              <label className="block text-xs text-slate-500 mb-1">{String(label)}</label>
              <textarea
                rows={2}
                value={String(val)}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
              />
            </div>
          ))}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500">Example Setup Screenshots</label>
              <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                <Upload className="h-3.5 w-3.5" /> Add Screenshot
                <input type="file" accept="image/*" onChange={handleUploadExample} className="hidden" />
              </label>
            </div>
            {exampleScreenshots.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {exampleScreenshots.map((src, idx) => (
                  <div key={idx} className="relative h-20 rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <img src={src} alt="Strategy example" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setExampleScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save Playbook
          </button>
        </form>

        {/* Live & Backtest Stats + Linked Trades */}
        {selectedStats && !creating && (
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Strategy Telemetry
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-slate-500">Live Performance</div>
                  <div className={`mt-1 font-mono text-base font-bold ${selectedStats.livePerf.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(selectedStats.livePerf.netPnl, cur, { signed: true })}
                  </div>
                  <div className="mt-1 font-mono text-slate-500">
                    {selectedStats.livePerf.closedTrades}t · {selectedStats.livePerf.winRate.toFixed(0)}% WR ·{' '}
                    {formatR(selectedStats.livePerf.averageR)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-slate-500">Backtest Performance</div>
                  <div className={`mt-1 font-mono text-base font-bold ${selectedStats.btPerf.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(selectedStats.btPerf.netPnl, cur, { signed: true })}
                  </div>
                  <div className="mt-1 font-mono text-slate-500">
                    {selectedStats.btPerf.closedTrades}t · {selectedStats.btPerf.winRate.toFixed(0)}% WR ·{' '}
                    {formatR(selectedStats.btPerf.averageR)}
                  </div>
                </div>
              </div>

              {(selectedStats.bestCond || selectedStats.worstCond) && (
                <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
                  {selectedStats.bestCond && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Best Condition:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {selectedStats.bestCond.label} ({formatCurrency(selectedStats.bestCond.netPnl, cur, { signed: true })})
                      </span>
                    </div>
                  )}
                  {selectedStats.worstCond && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Worst Condition:</span>
                      <span className="font-mono text-red-600 dark:text-red-400">
                        {selectedStats.worstCond.label} ({formatCurrency(selectedStats.worstCond.netPnl, cur, { signed: true })})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Linked Live Trades ({selectedStats.sLive.length})
              </h3>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {selectedStats.sLive.slice(0, 20).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDrawerTradeId(t.id)}
                    className="flex w-full items-center justify-between py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded"
                  >
                    <span className="font-mono font-medium">
                      {t.instrument} · {t.direction}
                    </span>
                    <span className={`font-mono font-semibold ${t.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(t.netPnl, cur, { signed: true })} ({formatR(t.actualR)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cross-Strategy Comparison Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Strategy Comparison Matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Strategy</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Live Trades</th>
                <th className="px-4 py-2.5 text-right">Live WR</th>
                <th className="px-4 py-2.5 text-right">Live PF</th>
                <th className="px-4 py-2.5 text-right">Live Avg R</th>
                <th className="px-4 py-2.5 text-right">Live Net P&L</th>
                <th className="px-4 py-2.5 text-right">Backtest P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
              {allStrategyComparison.map(({ strategy, livePerf, btPerf }) => (
                <tr key={strategy.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-sans font-semibold text-slate-900 dark:text-slate-100">
                    {strategy.name}
                  </td>
                  <td className="px-4 py-2.5 font-sans text-slate-600 dark:text-slate-400">{strategy.status}</td>
                  <td className="px-4 py-2.5 text-right">{livePerf.closedTrades}</td>
                  <td className="px-4 py-2.5 text-right">{livePerf.winRate.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right">
                    {Number.isFinite(livePerf.profitFactor) ? livePerf.profitFactor.toFixed(2) : '∞'}
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatR(livePerf.averageR)}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold ${
                      livePerf.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatCurrency(livePerf.netPnl, cur, { signed: true })}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400">
                    {btPerf.closedTrades > 0 ? formatCurrency(btPerf.netPnl, cur, { signed: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
