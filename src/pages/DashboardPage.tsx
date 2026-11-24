import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar as CalendarIcon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ConsistencyTab } from '../components/dashboard/ConsistencyTab';
import { AccountProgressCard } from '../components/ui/AccountProgressCard';
import { EmptyState } from '../components/ui/EmptyState';
import { useJournal } from '../context/JournalContext';
import {
  buildBreakdown,
  calculateDisciplineScore,
  calculatePerformance,
  detectPatternAlerts,
  hasValidStopLoss,
} from '../utils/calculations';
import { convertCurrency, formatCurrency, formatR } from '../utils/currency';
import {
  formatDateShortInTimezone,
  formatHoldingTime,
  getTodayKeyInTimezone,
  getWeekdayInTimezone,
  WEEKDAY_NAMES,
} from '../utils/timezone';

export function DashboardPage() {
  const {
    accounts,
    liveTrades,
    filteredLiveTrades,
    selectedAccountId,
    setSelectedAccountId,
    settings,
    setDrawerTradeId,
    setJournalDateDrawer,
    setActivePage,
  } = useJournal();

  const [dashboardTab, setDashboardTab] = useState<'overview' | 'consistency'>('overview');

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const startingBalance = useMemo(() => {
    if (selectedAccountId !== 'ALL') {
      const acc = accountsMap.get(selectedAccountId);
      return acc ? convertCurrency(acc.startingBalance, acc.currency, settings.displayCurrency) : 10000;
    }
    const total = activeAccounts.reduce(
      (s, a) => s + convertCurrency(a.startingBalance, a.currency, settings.displayCurrency),
      0
    );
    return total > 0 ? total : 10000;
  }, [selectedAccountId, accountsMap, activeAccounts, settings.displayCurrency]);

  const { metrics, equityCurve, dailyPnl } = useMemo(
    () =>
      calculatePerformance(
        filteredLiveTrades,
        startingBalance,
        accountsMap,
        settings.displayCurrency,
        settings.timezone
      ),
    [filteredLiveTrades, startingBalance, accountsMap, settings.displayCurrency, settings.timezone]
  );

  const discipline = useMemo(
    () => calculateDisciplineScore(filteredLiveTrades, settings.hardRiskRules),
    [filteredLiveTrades, settings.hardRiskRules]
  );

  const patternAlerts = useMemo(
    () => detectPatternAlerts(filteredLiveTrades, accountsMap, settings.displayCurrency, settings.timezone),
    [filteredLiveTrades, accountsMap, settings.displayCurrency, settings.timezone]
  );

  const weekdayData = useMemo(() => {
    const rows = buildBreakdown(
      filteredLiveTrades,
      (t) => String(getWeekdayInTimezone(t.openTime, settings.timezone)),
      accountsMap,
      settings.displayCurrency,
      (k) => WEEKDAY_NAMES[Number(k)] || k
    );
    const byIdx = new Map(rows.map((r) => [Number(r.key), r]));
    return [1, 2, 3, 4, 5, 6, 0].map((idx) => {
      const r = byIdx.get(idx);
      return {
        day: WEEKDAY_NAMES[idx],
        netPnl: r ? Number(r.netPnl.toFixed(2)) : 0,
        trades: r?.trades ?? 0,
      };
    });
  }, [filteredLiveTrades, accountsMap, settings.displayCurrency, settings.timezone]);

  const winLossPie = useMemo(
    () => [
      { name: 'Wins', value: metrics.wins, color: '#16A34A' },
      { name: 'Losses', value: metrics.losses, color: '#DC2626' },
      ...(metrics.breakevens > 0 ? [{ name: 'Breakeven', value: metrics.breakevens, color: '#64748B' }] : []),
    ],
    [metrics.wins, metrics.losses, metrics.breakevens]
  );

  // Mini Calendar for current month in user's timezone
  const miniCalendar = useMemo(() => {
    const today = getTodayKeyInTimezone(settings.timezone);
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7)); // 1..12
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dailyMap = new Map(dailyPnl.map((d) => [d.dateKey, d]));

    const cells: { day: number | null; dateKey: string; netPnl: number; trades: number }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateKey: '', netPnl: 0, trades: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = dailyMap.get(dk);
      cells.push({
        day: d,
        dateKey: dk,
        netPnl: info?.netPnl ?? 0,
        trades: info?.trades ?? 0,
      });
    }
    return {
      monthLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
        new Date(Date.UTC(year, month - 1, 15))
      ),
      cells,
    };
  }, [dailyPnl, settings.timezone]);

  const recentTrades = useMemo(
    () =>
      filteredLiveTrades
        .slice()
        .sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime())
        .slice(0, 8),
    [filteredLiveTrades]
  );

  if (filteredLiveTrades.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={BarChart3}
          title="No trades in this view yet"
          description="Log your first manual trade, import a broker CSV or screenshot, or load the 150-trade multi-market demo dataset to explore EdgeLedger."
        />
        {activeAccounts.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Configured Accounts</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {activeAccounts.map((acc) => (
                <AccountProgressCard
                  key={acc.id}
                  account={acc}
                  trades={liveTrades}
                  timeZone={settings.timezone}
                  selected={selectedAccountId === acc.id}
                  onSelect={() => setSelectedAccountId(selectedAccountId === acc.id ? 'ALL' : acc.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const cur = settings.displayCurrency;
  const kpiCards = [
    {
      label: 'Net P&L',
      value: formatCurrency(metrics.netPnl, cur, { signed: true }),
      sub: `${metrics.closedTrades} closed · ${metrics.openTrades} open`,
      tone: metrics.netPnl >= 0 ? 'pos' : 'neg',
    },
    {
      label: 'Win Rate',
      value: `${metrics.winRate.toFixed(1)}%`,
      sub: `${metrics.wins}W · ${metrics.losses}L · ${metrics.breakevens}BE`,
      tone: 'neutral',
    },
    {
      label: 'Profit Factor',
      value: Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : '∞',
      sub: `GP ${formatCurrency(metrics.grossProfit, cur, { compact: true })} / GL ${formatCurrency(metrics.grossLoss, cur, { compact: true })}`,
      tone: metrics.profitFactor >= 1 ? 'pos' : 'neg',
    },
    {
      label: 'Expectancy',
      value: formatCurrency(metrics.expectancyCurrency, cur, { signed: true }),
      sub: `${formatR(metrics.expectancyR)} per trade`,
      tone: metrics.expectancyCurrency >= 0 ? 'pos' : 'neg',
    },
    {
      label: 'Average R',
      value: formatR(metrics.averageR),
      sub: `Planned avg ${metrics.avgPlannedRR !== null ? `${metrics.avgPlannedRR.toFixed(2)}R` : 'N/A'}`,
      tone: metrics.averageR === null ? 'neutral' : metrics.averageR >= 0 ? 'pos' : 'neg',
    },
    {
      label: 'Avg Win / Avg Loss',
      value: `${formatCurrency(metrics.averageWin, cur, { compact: true })} / ${formatCurrency(metrics.averageLoss, cur, { compact: true })}`,
      sub: `W/L Ratio ${Number.isFinite(metrics.winLossRatio) ? metrics.winLossRatio.toFixed(2) : '∞'}`,
      tone: 'neutral',
    },
    {
      label: 'Max Drawdown',
      value: `${formatCurrency(-metrics.maxDrawdownValue, cur)} (${metrics.maxDrawdownPct.toFixed(1)}%)`,
      sub: `Recovery Factor ${Number.isFinite(metrics.recoveryFactor) ? metrics.recoveryFactor.toFixed(2) : '∞'}`,
      tone: 'neg',
    },
    {
      label: 'Largest Win / Loss',
      value: `${formatCurrency(metrics.largestWin, cur, { signed: true, compact: true })} / ${formatCurrency(metrics.largestLoss, cur, { compact: true })}`,
      sub: `Avg hold ${formatHoldingTime(metrics.avgHoldingMinutes)}`,
      tone: 'neutral',
    },
    {
      label: 'Streaks (Current / Max)',
      value: `${metrics.currentStreak > 0 ? `+${metrics.currentStreak}W` : metrics.currentStreak < 0 ? `${metrics.currentStreak}L` : '0'}`,
      sub: `Best ${metrics.longestWinStreak}W · Worst ${metrics.longestLossStreak}L`,
      tone: metrics.currentStreak > 0 ? 'pos' : metrics.currentStreak < 0 ? 'neg' : 'neutral',
    },
    {
      label: 'Total Trades & Fees',
      value: `${metrics.totalTrades}`,
      sub: `Fees paid ${formatCurrency(metrics.totalFees, cur)}`,
      tone: 'neutral',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Dashboard View Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 w-fit">
          {(
            [
              ['overview', 'Overview'],
              ['consistency', 'Consistency'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDashboardTab(id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                dashboardTab === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {metrics.closedTrades} closed · {metrics.openTrades} open
        </div>
      </div>

      {dashboardTab === 'consistency' ? (
        <ConsistencyTab
          trades={filteredLiveTrades}
          accountsMap={accountsMap}
          displayCurrency={cur}
          timeZone={settings.timezone}
          hardRiskRules={settings.hardRiskRules}
          onSelectDate={(dk) => setJournalDateDrawer(dk)}
        />
      ) : (
        <>
          {/* Pattern Alerts Banner */}
          {patternAlerts.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {patternAlerts.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                alert.severity === 'danger'
                  ? 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/20'
                  : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20'
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  alert.severity === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{alert.title}</div>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</div>
            <div
              className={`mt-1.5 font-mono text-base font-semibold tabular-nums truncate ${
                k.tone === 'pos'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : k.tone === 'neg'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {k.value}
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Primary Charts: Equity Curve & Drawdown */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Cumulative Equity Curve
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Starting {formatCurrency(startingBalance, cur)} → Current{' '}
                {formatCurrency(startingBalance + metrics.netPnl, cur)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums">
              {metrics.netPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className={metrics.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {formatCurrency(metrics.netPnl, cur, { signed: true })}
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metrics.netPnl >= 0 ? '#16A34A' : '#DC2626'} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={metrics.netPnl >= 0 ? '#16A34A' : '#DC2626'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="index" tick={{ fontSize: 11 }} stroke="#64748B" />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11 }}
                  stroke="#64748B"
                  tickFormatter={(v) => formatCurrency(Number(v), cur, { compact: true })}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                  formatter={(value: unknown) => [formatCurrency(Number(value), cur), 'Equity']}
                  labelFormatter={(l) => `Trade #${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={metrics.netPnl >= 0 ? '#16A34A' : '#DC2626'}
                  strokeWidth={2}
                  fill="url(#eqGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Discipline Score Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Discipline Score</h3>
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${
                  discipline.score >= 80
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : discipline.score >= 60
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {discipline.score}/100
              </span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              {[
                ['Rules Followed', discipline.rulesFollowedRate],
                ['Checklist Completion', discipline.checklistCompletionRate],
                ['Risk Limits Respected', discipline.riskLimitRespectedRate],
                ['Plan Adherence (0 Mistakes)', discipline.planAdherenceRate],
              ].map(([label, pct]) => (
                <div key={String(label)}>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                    <span>{String(label)}</span>
                    <span className="font-mono tabular-nums">{Number(pct).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.min(100, Math.max(0, Number(pct)))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {discipline.reasons.length > 0 && (
              <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  What lowered score
                </div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {discipline.reasons.slice(0, 3).map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {discipline.trend.length > 1 && (
            <div className="mt-4 h-20 border-t border-slate-100 dark:border-slate-800 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={discipline.trend}>
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#F8FAFC',
                    }}
                  />
                  <Line type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Secondary Charts: Drawdown, Daily P&L Bars, Win/Loss Donut, Weekday P&L */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Drawdown (Underwater %)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve.map((p) => ({ index: p.index, dd: -Number(p.drawdownPct.toFixed(2)) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="index" tick={{ fontSize: 10 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748B" tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                  formatter={(v: unknown) => [`${v}%`, 'Drawdown']}
                />
                <Area type="monotone" dataKey="dd" stroke="#DC2626" fill="#DC2626" fillOpacity={0.2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Daily Net P&L
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPnl.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="dateKey" tick={{ fontSize: 10 }} stroke="#64748B" tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748B" tickFormatter={(v) => formatCurrency(Number(v), cur, { compact: true })} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                  formatter={(v: unknown) => [formatCurrency(Number(v), cur, { signed: true }), 'Net P&L']}
                />
                <Bar dataKey="netPnl" isAnimationActive={false}>
                  {dailyPnl.slice(-30).map((entry) => (
                    <Cell key={entry.dateKey} fill={entry.netPnl >= 0 ? '#16A34A' : '#DC2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Win / Loss</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={winLossPie} dataKey="value" innerRadius={36} outerRadius={56} paddingAngle={2} isAnimationActive={false}>
                  {winLossPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400">{metrics.wins}W</span>
            <span className="text-red-600 dark:text-red-400">{metrics.losses}L</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">By Weekday</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#64748B" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                  formatter={(v: unknown) => [formatCurrency(Number(v), cur, { signed: true }), 'Net P&L']}
                />
                <Bar dataKey="netPnl" isAnimationActive={false}>
                  {weekdayData.map((d) => (
                    <Cell key={d.day} fill={d.netPnl >= 0 ? '#16A34A' : '#DC2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Mini Calendar + Recent Trades */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CalendarIcon className="h-4 w-4 text-slate-500" />
              {miniCalendar.monthLabel}
            </h3>
            <button
              type="button"
              onClick={() => setActivePage('analysis')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Full Calendar →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500 mb-1">
            {WEEKDAY_NAMES.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {miniCalendar.cells.map((c, idx) =>
              c.day === null ? (
                <div key={idx} className="h-11" />
              ) : (
                <button
                  key={c.dateKey}
                  type="button"
                  onClick={() => setJournalDateDrawer(c.dateKey)}
                  className={`flex h-11 flex-col items-center justify-center rounded-md border text-[10px] transition-colors ${
                    c.trades === 0
                      ? 'border-slate-100 dark:border-slate-800/70 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                      : c.netPnl >= 0
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  <span className="font-mono font-semibold">{c.day}</span>
                  {c.trades > 0 && (
                    <span className="font-mono text-[9px] truncate max-w-full px-0.5 tabular-nums">
                      {formatCurrency(c.netPnl, cur, { compact: true, signed: true })}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Executions</h3>
            <button
              type="button"
              onClick={() => setActivePage('journal')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Full Journal →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 font-medium">Setup</th>
                  <th className="pb-2 font-medium text-right">R</th>
                  <th className="pb-2 font-medium text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {recentTrades.map((t) => {
                  const accCur = accountsMap.get(t.accountId)?.currency ?? 'USD';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setDrawerTradeId(t.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateShortInTimezone(t.openTime, settings.timezone)}
                      </td>
                      <td className="py-2 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {t.instrument}
                      </td>
                      <td
                        className={`py-2 font-mono font-medium ${
                          t.direction === 'LONG' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.direction}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                        {t.setup || '—'}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatR(hasValidStopLoss(t) ? t.actualR : null)}
                      </td>
                      <td
                        className={`py-2 text-right font-mono font-semibold tabular-nums ${
                          t.status === 'OPEN'
                            ? 'text-slate-500'
                            : t.netPnl >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.status === 'OPEN'
                          ? 'OPEN'
                          : formatCurrency(t.netPnl, accCur, { signed: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Per-Broker Account Progress Strip */}
      {activeAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Account & Broker Progress
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {activeAccounts.map((acc) => (
              <AccountProgressCard
                key={acc.id}
                account={acc}
                trades={liveTrades}
                timeZone={settings.timezone}
                selected={selectedAccountId === acc.id}
                onSelect={() => setSelectedAccountId(selectedAccountId === acc.id ? 'ALL' : acc.id)}
              />
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
