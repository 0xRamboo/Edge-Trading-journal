import React, { useMemo, useState } from 'react';
import { CheckCircle2, FlaskConical, Plus, Trash2, Upload, XCircle } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '../components/ui/EmptyState';
import { useJournal } from '../context/JournalContext';
import { BacktestSession } from '../types/trading';
import { buildBreakdown, calculatePerformance } from '../utils/calculations';
import { formatCurrency, formatR } from '../utils/currency';
import { getWeekdayInTimezone, WEEKDAY_NAMES } from '../utils/timezone';

export function BacktestingPage() {
  const {
    accounts,
    strategies,
    trades,
    backtestSessions,
    settings,
    saveBacktestSession,
    deleteBacktestSession,
    openTradeModal,
    openImportModal,
    setDrawerTradeId,
    pushToast,
  } = useJournal();

  const [selectedId, setSelectedId] = useState<string>(backtestSessions[0]?.id ?? '');
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? '');
  const [instrument, setInstrument] = useState('EURUSD');
  const [timeframe, setTimeframe] = useState('15m');
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-11-01');
  const [startingBalance, setStartingBalance] = useState('25000');
  const [riskPerTradePct, setRiskPerTradePct] = useState('1.0');

  const activeSession = useMemo(
    () => backtestSessions.find((b) => b.id === selectedId) ?? backtestSessions[0] ?? null,
    [backtestSessions, selectedId]
  );

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const strategiesMap = useMemo(() => new Map(strategies.map((s) => [s.id, s.name])), [strategies]);

  const sessionTrades = useMemo(() => {
    if (!activeSession) return [];
    return trades.filter((t) => t.isBacktest && t.backtestSessionId === activeSession.id);
  }, [trades, activeSession]);

  const liveStrategyTrades = useMemo(() => {
    if (!activeSession || !activeSession.strategyId) return [];
    return trades.filter((t) => !t.isBacktest && t.strategyId === activeSession.strategyId);
  }, [trades, activeSession]);

  const btPerf = useMemo(() => {
    if (!activeSession) return null;
    return calculatePerformance(
      sessionTrades,
      activeSession.startingBalance,
      accountsMap,
      activeSession.currency || settings.displayCurrency,
      settings.timezone
    );
  }, [activeSession, sessionTrades, accountsMap, settings.displayCurrency, settings.timezone]);

  const livePerf = useMemo(() => {
    if (!activeSession) return null;
    return calculatePerformance(
      liveStrategyTrades,
      activeSession.startingBalance,
      accountsMap,
      activeSession.currency || settings.displayCurrency,
      settings.timezone
    );
  }, [activeSession, liveStrategyTrades, accountsMap, settings.displayCurrency, settings.timezone]);

  const breakdowns = useMemo(() => {
    if (!activeSession) return { bySession: [], byDay: [], bySetup: [], byCondition: [] };
    const cur = activeSession.currency || settings.displayCurrency;
    return {
      bySession: buildBreakdown(sessionTrades, (t) => t.session, accountsMap, cur),
      byDay: buildBreakdown(
        sessionTrades,
        (t) => WEEKDAY_NAMES[getWeekdayInTimezone(t.openTime, settings.timezone)] || 'Mon',
        accountsMap,
        cur
      ),
      bySetup: buildBreakdown(sessionTrades, (t) => t.setup || 'Standard', accountsMap, cur),
      byCondition: buildBreakdown(sessionTrades, (t) => t.marketCondition || 'Unspecified', accountsMap, cur),
    };
  }, [activeSession, sessionTrades, accountsMap, settings.displayCurrency, settings.timezone]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const session: BacktestSession = {
      id: `bt-${Date.now()}`,
      name: name.trim(),
      strategyId,
      instrument: instrument.trim().toUpperCase(),
      timeframe: timeframe.trim(),
      startDate,
      endDate,
      startingBalance: parseFloat(startingBalance) || 10000,
      riskPerTradePct: parseFloat(riskPerTradePct) || 1.0,
      currency: settings.displayCurrency,
      readyCriteria: {
        minTrades: 100,
        minProfitFactor: 1.5,
        maxDrawdownPct: 10,
        minMarketConditions: 3,
      },
      createdAt: new Date().toISOString(),
    };
    await saveBacktestSession(session);
    setSelectedId(session.id);
    setCreating(false);
    setName('');
    pushToast('success', `Created backtest session "${session.name}".`);
  };

  const updateCriteria = async (field: keyof BacktestSession['readyCriteria'], val: number) => {
    if (!activeSession) return;
    await saveBacktestSession({
      ...activeSession,
      readyCriteria: { ...activeSession.readyCriteria, [field]: val },
    });
  };

  const cur = activeSession?.currency || settings.displayCurrency;

  // Ready to Go Live evaluation
  const readyEval = useMemo(() => {
    if (!activeSession || !btPerf) return null;
    const c = activeSession.readyCriteria;
    const m = btPerf.metrics;
    const positiveConditions = breakdowns.byCondition.filter((r) => r.expectancy > 0).length;
    const checks = [
      {
        label: `Minimum Trades (>= ${c.minTrades})`,
        actual: `${m.closedTrades}`,
        pass: m.closedTrades >= c.minTrades,
      },
      {
        label: `Profit Factor (> ${c.minProfitFactor})`,
        actual: Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '∞',
        pass: m.profitFactor > c.minProfitFactor,
      },
      {
        label: `Max Drawdown (< ${c.maxDrawdownPct}%)`,
        actual: `${m.maxDrawdownPct.toFixed(1)}%`,
        pass: m.maxDrawdownPct < c.maxDrawdownPct,
      },
      {
        label: `Positive Expectancy across >= ${c.minMarketConditions} market conditions`,
        actual: `${positiveConditions} conditions`,
        pass: positiveConditions >= c.minMarketConditions,
      },
    ];
    return {
      checks,
      passedAll: checks.every((x) => x.pass),
    };
  }, [activeSession, btPerf, breakdowns.byCondition]);

  const sampleConfidence = useMemo(() => {
    const n = btPerf?.metrics.closedTrades ?? 0;
    if (n >= 100) return { label: 'High Confidence (100+ trades)', tone: 'text-emerald-600 dark:text-emerald-400' };
    if (n >= 30) return { label: 'Moderate Sample (30–99 trades)', tone: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Low Confidence (<30 trades)', tone: 'text-red-600 dark:text-red-400' };
  }, [btPerf]);

  return (
    <div className="space-y-6">
      {/* Header & Session Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={activeSession?.id ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            {backtestSessions.length === 0 && <option value="">No Backtest Sessions</option>}
            {backtestSessions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.instrument} · {b.timeframe})
              </option>
            ))}
          </select>
          {activeSession && (
            <span className="text-xs text-slate-500">
              {strategiesMap.get(activeSession.strategyId) || 'Unlinked Strategy'} · {activeSession.startDate} →{' '}
              {activeSession.endDate}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSession && (
            <>
              <button
                type="button"
                onClick={() => openTradeModal(null, activeSession.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" /> Log Backtest Trade
              </button>
              <button
                type="button"
                onClick={() => openImportModal('csv', activeSession.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <Upload className="h-3.5 w-3.5" /> Import CSV
              </button>
              <button
                type="button"
                onClick={() => void deleteBacktestSession(activeSession.id)}
                className="rounded-lg p-2 text-slate-500 hover:text-red-600"
                title="Delete Session"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <Plus className="h-3.5 w-3.5" /> New Session
          </button>
        </div>
      </div>

      {/* Create Session Form */}
      {creating && (
        <form
          onSubmit={handleCreateSession}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 grid grid-cols-1 gap-4 sm:grid-cols-4"
        >
          <div>
            <label className="block text-xs text-slate-500 mb-1">Session Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. XAUUSD ORB 2026"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Strategy</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            >
              <option value="">Unassigned</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Instrument & TF</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs uppercase"
              />
              <input
                type="text"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Balance / Risk %</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                className="w-2/3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs"
              />
              <input
                type="number"
                step="0.1"
                value={riskPerTradePct}
                onChange={(e) => setRiskPerTradePct(e.target.value)}
                className="w-1/3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="sm:col-span-2 flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Create Session
            </button>
          </div>
        </form>
      )}

      {!activeSession || !btPerf ? (
        <EmptyState
          icon={FlaskConical}
          title="No backtest sessions yet"
          description="Create a backtesting session to replay historical setups, validate statistical edge, and verify 'Ready to Go Live' criteria before risking real capital."
          primaryActionLabel="Create Backtest Session"
          onPrimaryAction={() => setCreating(true)}
        />
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ['Trades', `${btPerf.metrics.closedTrades}`],
              ['Win Rate', `${btPerf.metrics.winRate.toFixed(1)}%`],
              ['Profit Factor', Number.isFinite(btPerf.metrics.profitFactor) ? btPerf.metrics.profitFactor.toFixed(2) : '∞'],
              ['Expectancy', formatCurrency(btPerf.metrics.expectancyCurrency, cur, { signed: true })],
              ['Average R', formatR(btPerf.metrics.averageR)],
              ['Max Drawdown', `${btPerf.metrics.maxDrawdownPct.toFixed(1)}%`],
              ['Max Losing Streak', `${btPerf.metrics.longestLossStreak}L`],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {val}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs">
            <span className="text-slate-500">Sample-Size Confidence Indicator</span>
            <span className={`font-mono font-semibold ${sampleConfidence.tone}`}>{sampleConfidence.label}</span>
          </div>

          {/* Equity Curve + Ready to Go Live Checklist */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-7">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Backtest Equity Curve
              </h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={btPerf.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="index" tick={{ fontSize: 11 }} stroke="#64748B" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v) => formatCurrency(Number(v), cur, { compact: true })} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                      formatter={(v: unknown) => [formatCurrency(Number(v), cur), 'Equity']}
                    />
                    <Area type="monotone" dataKey="equity" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.18} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ready to Go Live Checklist */}
            {readyEval && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Ready to Go Live Criteria
                  </h3>
                  <span
                    className={`font-mono text-xs font-bold ${
                      readyEval.passedAll ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {readyEval.passedAll ? 'PASS · READY' : 'FAIL · KEEP TESTING'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {readyEval.checks.map((chk) => (
                    <div key={chk.label} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {chk.pass ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <span className="text-slate-700 dark:text-slate-300">{chk.label}</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{chk.actual}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px]">
                  <div>
                    <label className="text-slate-500">Min Trades</label>
                    <input
                      type="number"
                      value={activeSession.readyCriteria.minTrades}
                      onChange={(e) => void updateCriteria('minTrades', parseInt(e.target.value, 10) || 100)}
                      className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500">Min Profit Factor</label>
                    <input
                      type="number"
                      step="0.1"
                      value={activeSession.readyCriteria.minProfitFactor}
                      onChange={(e) => void updateCriteria('minProfitFactor', parseFloat(e.target.value) || 1.5)}
                      className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500">Max DD %</label>
                    <input
                      type="number"
                      step="1"
                      value={activeSession.readyCriteria.maxDrawdownPct}
                      onChange={(e) => void updateCriteria('maxDrawdownPct', parseFloat(e.target.value) || 10)}
                      className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500">Min Conditions</label>
                    <input
                      type="number"
                      value={activeSession.readyCriteria.minMarketConditions}
                      onChange={(e) => void updateCriteria('minMarketConditions', parseInt(e.target.value, 10) || 3)}
                      className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Backtest vs Live Comparison */}
          {livePerf && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Backtest vs Live Comparison ({strategiesMap.get(activeSession.strategyId) || 'Strategy'})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="pb-2">Environment</th>
                      <th className="pb-2 text-right">Trades</th>
                      <th className="pb-2 text-right">Win Rate</th>
                      <th className="pb-2 text-right">Profit Factor</th>
                      <th className="pb-2 text-right">Avg R</th>
                      <th className="pb-2 text-right">Max DD %</th>
                      <th className="pb-2 text-right">Net P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {[
                      ['Backtest', btPerf.metrics],
                      ['Live', livePerf.metrics],
                    ].map(([env, m]) => {
                      const met = m as typeof btPerf.metrics;
                      return (
                        <tr key={String(env)}>
                          <td className="py-2.5 font-sans font-semibold text-slate-900 dark:text-slate-100">{String(env)}</td>
                          <td className="py-2.5 text-right">{met.closedTrades}</td>
                          <td className="py-2.5 text-right">{met.winRate.toFixed(1)}%</td>
                          <td className="py-2.5 text-right">{Number.isFinite(met.profitFactor) ? met.profitFactor.toFixed(2) : '∞'}</td>
                          <td className="py-2.5 text-right">{formatR(met.averageR)}</td>
                          <td className="py-2.5 text-right">{met.maxDrawdownPct.toFixed(1)}%</td>
                          <td className={`py-2.5 text-right font-semibold ${met.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(met.netPnl, cur, { signed: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Performance by Session, Day, Setup Variant */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['By Session', breakdowns.bySession],
              ['By Day', breakdowns.byDay],
              ['By Setup Variant', breakdowns.bySetup],
            ].map(([title, rows]) => (
              <div key={String(title)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{String(title)}</h4>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {(rows as typeof breakdowns.bySession).map((r) => (
                    <div key={r.key} className="flex items-center justify-between py-2">
                      <span className="text-slate-700 dark:text-slate-300">
                        {r.label} <span className="text-slate-400">({r.trades}t · {r.winRate.toFixed(0)}%)</span>
                      </span>
                      <span className={`font-mono font-semibold ${r.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(r.netPnl, cur, { signed: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Session Trade List */}
          {sessionTrades.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Backtest Trades ({sessionTrades.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="pb-2">Instrument</th>
                      <th className="pb-2">Side</th>
                      <th className="pb-2">Session</th>
                      <th className="pb-2">Condition</th>
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">Net P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sessionTrades.slice(0, 30).map((t) => (
                      <tr key={t.id} onClick={() => setDrawerTradeId(t.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 font-mono font-semibold">{t.instrument}</td>
                        <td className="py-2 font-mono">{t.direction}</td>
                        <td className="py-2">{t.session}</td>
                        <td className="py-2 text-slate-500">{t.marketCondition || '—'}</td>
                        <td className="py-2 text-right font-mono">{formatR(t.actualR)}</td>
                        <td className={`py-2 text-right font-mono font-semibold ${t.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrency(t.netPnl, cur, { signed: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
