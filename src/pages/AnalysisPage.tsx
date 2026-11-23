import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, LineChart as LineIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { EmptyState } from '../components/ui/EmptyState';
import { useJournal } from '../context/JournalContext';
import { Trade } from '../types/trading';
import {
  BreakdownRow,
  buildBreakdown,
  calculatePerformance,
  getTradePnlInDisplayCurrency,
  runMonteCarloSimulation,
} from '../utils/calculations';
import { convertCurrency, formatCurrency, formatR } from '../utils/currency';
import {
  getDateKeyInTimezone,
  getHourInTimezone,
  getMonthKeyInTimezone,
  getTodayKeyInTimezone,
  getWeekdayInTimezone,
  getYearKeyInTimezone,
  WEEKDAY_NAMES,
} from '../utils/timezone';

type AnalysisTab = 'breakdowns' | 'calendar' | 'diagnostics' | 'montecarlo';
type DimensionKey =
  | 'setup'
  | 'strategy'
  | 'instrument'
  | 'session'
  | 'weekday'
  | 'hour'
  | 'month'
  | 'holding'
  | 'size'
  | 'account';

function BreakdownTable({ rows, currency }: { rows: BreakdownRow[]; currency: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Segment</th>
            <th className="px-4 py-3 font-medium text-right">Trades</th>
            <th className="px-4 py-3 font-medium text-right">Win Rate</th>
            <th className="px-4 py-3 font-medium text-right">Net P&L</th>
            <th className="px-4 py-3 font-medium text-right">Profit Factor</th>
            <th className="px-4 py-3 font-medium text-right">Avg R</th>
            <th className="px-4 py-3 font-medium text-right">Expectancy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                <div className="flex items-center gap-2">
                  <span>{r.label}</span>
                  {r.lowSampleWarning && (
                    <span
                      title="Fewer than 30 trades: interpret cautiously"
                      className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-600 dark:text-amber-400"
                    >
                      <AlertTriangle className="h-3 w-3" /> &lt;30
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {r.trades}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {r.winRate.toFixed(1)}%
              </td>
              <td
                className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${
                  r.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatCurrency(r.netPnl, currency, { signed: true })}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {Number.isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : '∞'}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {formatR(r.averageR)}
              </td>
              <td
                className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                  r.expectancy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatCurrency(r.expectancy, currency, { signed: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysisPage() {
  const {
    accounts,
    strategies,
    filteredLiveTrades,
    selectedAccountId,
    settings,
    setJournalDateDrawer,
  } = useJournal();

  const [tab, setTab] = useState<AnalysisTab>('breakdowns');
  const [dimension, setDimension] = useState<DimensionKey>('setup');

  const today = getTodayKeyInTimezone(settings.timezone);
  const [calYear, setCalYear] = useState(Number(today.slice(0, 4)));
  const [calMonth, setCalMonth] = useState(Number(today.slice(5, 7))); // 1..12

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const strategiesMap = useMemo(() => new Map(strategies.map((s) => [s.id, s.name])), [strategies]);

  const startingBalance = useMemo(() => {
    if (selectedAccountId !== 'ALL') {
      const a = accountsMap.get(selectedAccountId);
      return a ? convertCurrency(a.startingBalance, a.currency, settings.displayCurrency) : 10000;
    }
    const tot = accounts
      .filter((a) => !a.archived)
      .reduce((s, a) => s + convertCurrency(a.startingBalance, a.currency, settings.displayCurrency), 0);
    return tot > 0 ? tot : 10000;
  }, [selectedAccountId, accountsMap, accounts, settings.displayCurrency]);

  const { metrics, dailyPnl } = useMemo(
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

  const cur = settings.displayCurrency;
  const closedTrades = useMemo(() => filteredLiveTrades.filter((t) => t.status !== 'OPEN'), [filteredLiveTrades]);

  // Dimension breakdown
  const dimensionRows = useMemo(() => {
    const holdingBucket = (min: number) => {
      if (min < 15) return '0–15m (Scalp)';
      if (min < 60) return '15–60m (Intraday)';
      if (min < 240) return '1–4h (Session)';
      if (min < 1440) return '4–24h (Day)';
      return '24h+ (Swing)';
    };
    const sizeBucket = (sz: number) => {
      if (sz < 0.5) return '< 0.5 units';
      if (sz <= 1.5) return '0.5–1.5 units';
      if (sz <= 10) return '1.5–10 units';
      return '> 10 units';
    };

    switch (dimension) {
      case 'setup':
        return buildBreakdown(closedTrades, (t) => t.setup || 'Unspecified', accountsMap, cur);
      case 'strategy':
        return buildBreakdown(closedTrades, (t) => strategiesMap.get(t.strategyId) || 'Unassigned', accountsMap, cur);
      case 'instrument':
        return buildBreakdown(closedTrades, (t) => t.instrument, accountsMap, cur);
      case 'session':
        return buildBreakdown(closedTrades, (t) => t.session, accountsMap, cur);
      case 'weekday':
        return buildBreakdown(
          closedTrades,
          (t) => String(getWeekdayInTimezone(t.openTime, settings.timezone)),
          accountsMap,
          cur,
          (k) => WEEKDAY_NAMES[Number(k)] || k
        );
      case 'hour':
        return buildBreakdown(
          closedTrades,
          (t) => `${String(getHourInTimezone(t.openTime, settings.timezone)).padStart(2, '0')}:00`,
          accountsMap,
          cur
        ).sort((a, b) => a.key.localeCompare(b.key));
      case 'month':
        return buildBreakdown(
          closedTrades,
          (t) => getMonthKeyInTimezone(t.openTime, settings.timezone) || 'Unknown',
          accountsMap,
          cur
        ).sort((a, b) => a.key.localeCompare(b.key));
      case 'holding':
        return buildBreakdown(closedTrades, (t) => holdingBucket(t.holdingTimeMinutes), accountsMap, cur);
      case 'size':
        return buildBreakdown(closedTrades, (t) => sizeBucket(t.size), accountsMap, cur);
      case 'account':
        return buildBreakdown(
          closedTrades,
          (t) => accountsMap.get(t.accountId)?.name || 'Account',
          accountsMap,
          cur
        );
    }
  }, [dimension, closedTrades, accountsMap, strategiesMap, cur, settings.timezone]);

  // 24-Hour Heatmap
  const hourlyHeatmap = useMemo(() => {
    const rows = buildBreakdown(
      closedTrades,
      (t) => String(getHourInTimezone(t.openTime, settings.timezone)),
      accountsMap,
      cur
    );
    const map = new Map(rows.map((r) => [Number(r.key), r]));
    return Array.from({ length: 24 }, (_, h) => {
      const r = map.get(h);
      return {
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        netPnl: r?.netPnl ?? 0,
        trades: r?.trades ?? 0,
        winRate: r?.winRate ?? 0,
      };
    });
  }, [closedTrades, accountsMap, cur, settings.timezone]);

  // Calendar Grid with Weekly Summary Column
  const calendarWeeks = useMemo(() => {
    const firstDow = new Date(Date.UTC(calYear, calMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate();
    const dailyMap = new Map(dailyPnl.map((d) => [d.dateKey, d]));

    const flatCells: ({ day: number; dateKey: string; netPnl: number; trades: number; wins: number; disciplinePct: number } | null)[] = [];
    for (let i = 0; i < firstDow; i++) flatCells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = dailyMap.get(dk);
      flatCells.push({
        day: d,
        dateKey: dk,
        netPnl: info?.netPnl ?? 0,
        trades: info?.trades ?? 0,
        wins: info?.wins ?? 0,
        disciplinePct: info?.disciplinePct ?? 100,
      });
    }
    while (flatCells.length % 7 !== 0) flatCells.push(null);

    const weeks: {
      days: typeof flatCells;
      netPnl: number;
      trades: number;
      winRate: number;
      bestDay: number | null;
      worstDay: number | null;
      disciplinePct: number;
    }[] = [];

    for (let i = 0; i < flatCells.length; i += 7) {
      const slice = flatCells.slice(i, i + 7);
      const active = slice.filter((x): x is NonNullable<typeof x> => x !== null && x.trades > 0);
      const netPnl = active.reduce((s, d) => s + d.netPnl, 0);
      const tr = active.reduce((s, d) => s + d.trades, 0);
      const wins = active.reduce((s, d) => s + d.wins, 0);
      const bestDay = active.length > 0 ? Math.max(...active.map((d) => d.netPnl)) : null;
      const worstDay = active.length > 0 ? Math.min(...active.map((d) => d.netPnl)) : null;
      const disc = active.length > 0 ? active.reduce((s, d) => s + d.disciplinePct, 0) / active.length : 100;
      weeks.push({
        days: slice,
        netPnl,
        trades: tr,
        winRate: tr > 0 ? (wins / tr) * 100 : 0,
        bestDay,
        worstDay,
        disciplinePct: disc,
      });
    }
    return weeks;
  }, [calYear, calMonth, dailyPnl]);

  const monthlySummary = useMemo(
    () =>
      buildBreakdown(
        closedTrades,
        (t) => getMonthKeyInTimezone(t.openTime, settings.timezone) || 'Unknown',
        accountsMap,
        cur
      ).sort((a, b) => b.key.localeCompare(a.key)),
    [closedTrades, accountsMap, cur, settings.timezone]
  );

  const yearlySummary = useMemo(
    () =>
      buildBreakdown(
        closedTrades,
        (t) => getYearKeyInTimezone(t.openTime, settings.timezone) || 'Unknown',
        accountsMap,
        cur
      ).sort((a, b) => b.key.localeCompare(a.key)),
    [closedTrades, accountsMap, cur, settings.timezone]
  );

  // Diagnostics: MAE/MFE, Mistakes, Rules Followed vs Broken, Emotions, Overtrading, Post-Consecutive Loss
  const diagnostics = useMemo(() => {
    const maeMfePoints = closedTrades
      .filter((t) => t.mae !== null && t.mfe !== null)
      .slice(-200)
      .map((t) => ({
        instrument: t.instrument,
        mae: t.mae ?? 0,
        mfe: t.mfe ?? 0,
        pnl: getTradePnlInDisplayCurrency(t, accountsMap, cur),
      }));

    // Cost of mistakes
    const mistakeMap = new Map<string, { count: number; totalPnl: number; lossesOnly: number }>();
    for (const t of closedTrades) {
      const pnl = getTradePnlInDisplayCurrency(t, accountsMap, cur);
      for (const tag of t.mistakeTags) {
        const entry = mistakeMap.get(tag) ?? { count: 0, totalPnl: 0, lossesOnly: 0 };
        entry.count += 1;
        entry.totalPnl += pnl;
        if (pnl < 0) entry.lossesOnly += pnl;
        mistakeMap.set(tag, entry);
      }
    }
    const mistakeRows = Array.from(mistakeMap.entries())
      .map(([tag, d]) => ({ tag, ...d }))
      .sort((a, b) => a.totalPnl - b.totalPnl);

    const rulesRows = buildBreakdown(
      closedTrades,
      (t) => (t.rulesFollowed ? 'Rules Followed' : 'Rules Broken'),
      accountsMap,
      cur
    );

    const emotionRows = buildBreakdown(
      closedTrades,
      (t) => `${t.emotionBefore.score}/5 · ${t.emotionBefore.tag}`,
      accountsMap,
      cur
    );

    // Overtrading detection: group by trades-per-day bucket
    const byDayCount = new Map<string, Trade[]>();
    for (const t of closedTrades) {
      const dk = getDateKeyInTimezone(t.openTime, settings.timezone);
      const arr = byDayCount.get(dk) ?? [];
      arr.push(t);
      byDayCount.set(dk, arr);
    }
    const overtradingBuckets = new Map<string, { days: number; trades: number; netPnl: number }>();
    for (const list of byDayCount.values()) {
      const bucket = list.length === 1 ? '1 trade/day' : list.length <= 3 ? '2–3 trades/day' : '4+ trades/day';
      const curB = overtradingBuckets.get(bucket) ?? { days: 0, trades: 0, netPnl: 0 };
      curB.days += 1;
      curB.trades += list.length;
      curB.netPnl += list.reduce((s, t) => s + getTradePnlInDisplayCurrency(t, accountsMap, cur), 0);
      overtradingBuckets.set(bucket, curB);
    }

    // Performance after consecutive losses (0, 1, 2, 3+)
    const sorted = closedTrades
      .slice()
      .sort((a, b) => new Date(a.closeTime || a.openTime).getTime() - new Date(b.closeTime || b.openTime).getTime());
    const afterStreak = {
      'After 0 losses': { trades: 0, wins: 0, pnl: 0 },
      'After 1 loss': { trades: 0, wins: 0, pnl: 0 },
      'After 2 losses': { trades: 0, wins: 0, pnl: 0 },
      'After 3+ losses': { trades: 0, wins: 0, pnl: 0 },
    };
    let lossStreak = 0;
    for (const t of sorted) {
      const pnl = getTradePnlInDisplayCurrency(t, accountsMap, cur);
      const key =
        lossStreak === 0
          ? 'After 0 losses'
          : lossStreak === 1
          ? 'After 1 loss'
          : lossStreak === 2
          ? 'After 2 losses'
          : 'After 3+ losses';
      afterStreak[key].trades += 1;
      if (pnl > 0) afterStreak[key].wins += 1;
      afterStreak[key].pnl += pnl;
      if (pnl < 0) lossStreak += 1;
      else if (pnl > 0) lossStreak = 0;
    }

    return {
      maeMfePoints,
      mistakeRows,
      rulesRows,
      emotionRows,
      overtradingRows: Array.from(overtradingBuckets.entries()).map(([bucket, v]) => ({ bucket, ...v })),
      afterStreakRows: Object.entries(afterStreak).map(([label, v]) => ({
        label,
        ...v,
        winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      })),
    };
  }, [closedTrades, accountsMap, cur, settings.timezone]);

  const monteCarlo = useMemo(
    () => runMonteCarloSimulation(closedTrades, startingBalance, accountsMap, cur, 1000, 50),
    [closedTrades, startingBalance, accountsMap, cur]
  );

  if (filteredLiveTrades.length === 0) {
    return (
      <EmptyState
        icon={LineIcon}
        title="No analytics data available"
        description="Add trades or load the demo dataset to unlock breakdowns, MAE/MFE diagnostics, heatmaps, and Monte Carlo simulations."
      />
    );
  }

  const calTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(calYear, calMonth - 1, 15))
  );

  const prevCalMonth = () => {
    if (calMonth === 1) {
      setCalYear((y) => y - 1);
      setCalMonth(12);
    } else setCalMonth((m) => m - 1);
  };
  const nextCalMonth = () => {
    if (calMonth === 12) {
      setCalYear((y) => y + 1);
      setCalMonth(1);
    } else setCalMonth((m) => m + 1);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 w-fit">
        {[
          ['breakdowns', 'Breakdowns & Heatmap'],
          ['calendar', 'P&L Calendar & Periods'],
          ['diagnostics', 'MAE/MFE, Mistakes & Tilt'],
          ['montecarlo', 'Monte Carlo & Risk of Ruin'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as AnalysisTab)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'breakdowns' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['setup', 'Setup'],
                ['strategy', 'Strategy'],
                ['instrument', 'Instrument'],
                ['session', 'Session'],
                ['weekday', 'Day of Week'],
                ['hour', 'Hour of Day'],
                ['month', 'Month'],
                ['holding', 'Holding Time'],
                ['size', 'Position Size'],
                ['account', 'Account / Broker'],
              ] as [DimensionKey, string][]
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDimension(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  dimension === k
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Net P&L by {dimension.charAt(0).toUpperCase() + dimension.slice(1)}
            </h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dimensionRows.slice(0, 16)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v) => formatCurrency(Number(v), cur, { compact: true })} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                    formatter={(v: unknown) => [formatCurrency(Number(v), cur, { signed: true }), 'Net P&L']}
                  />
                  <Bar dataKey="netPnl" isAnimationActive={false}>
                    {dimensionRows.slice(0, 16).map((r) => (
                      <Cell key={r.key} fill={r.netPnl >= 0 ? '#16A34A' : '#DC2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <BreakdownTable rows={dimensionRows} currency={cur} />

          {/* 24-Hour Heatmap */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Hour-of-Day P&L Heatmap ({settings.timezone})
              </h3>
              <p className="text-xs text-slate-500">Identify your sharpest and weakest execution hours.</p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-12">
              {hourlyHeatmap.map((h) => (
                <div
                  key={h.hour}
                  className={`rounded-lg border p-2 text-center ${
                    h.trades === 0
                      ? 'border-slate-200 dark:border-slate-800 text-slate-400'
                      : h.netPnl >= 0
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  <div className="font-mono text-[10px] font-semibold">{h.label}</div>
                  <div className="mt-0.5 font-mono text-[11px] font-bold tabular-nums">
                    {h.trades > 0 ? formatCurrency(h.netPnl, cur, { compact: true, signed: true }) : '—'}
                  </div>
                  <div className="font-mono text-[10px] opacity-75">{h.trades}t</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{calTitle}</h3>
                <p className="text-xs text-slate-500">Click any day to open trades & daily journal notes.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevCalMonth}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextCalMonth}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[760px] space-y-2">
                <div className="grid grid-cols-8 gap-2 text-center text-xs font-medium text-slate-500">
                  {WEEKDAY_NAMES.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                  <div className="text-blue-600 dark:text-blue-400">Weekly Summary</div>
                </div>

                {calendarWeeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-8 gap-2">
                    {week.days.map((d, dIdx) =>
                      d === null ? (
                        <div key={dIdx} className="h-20 rounded-lg bg-slate-50/50 dark:bg-slate-950/30" />
                      ) : (
                        <button
                          key={d.dateKey}
                          type="button"
                          onClick={() => setJournalDateDrawer(d.dateKey)}
                          className={`flex h-20 flex-col justify-between rounded-lg border p-2 text-left transition-colors ${
                            d.trades === 0
                              ? 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              : d.netPnl >= 0
                              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30'
                              : 'border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{d.day}</span>
                            {d.trades > 0 && <span className="text-[10px] text-slate-500">{d.trades}t</span>}
                          </div>
                          {d.trades > 0 && (
                            <div
                              className={`font-mono text-xs font-bold tabular-nums ${
                                d.netPnl >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                              }`}
                            >
                              {formatCurrency(d.netPnl, cur, { compact: true, signed: true })}
                            </div>
                          )}
                        </button>
                      )
                    )}

                    {/* Weekly P&L Column */}
                    <div className="flex h-20 flex-col justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-2 text-[10px] tabular-nums">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-500">W{wIdx + 1}</span>
                        <span className="font-mono text-slate-500">{week.trades}t · {week.winRate.toFixed(0)}%</span>
                      </div>
                      <div
                        className={`font-mono text-xs font-bold ${
                          week.trades === 0
                            ? 'text-slate-400'
                            : week.netPnl >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {week.trades > 0 ? formatCurrency(week.netPnl, cur, { compact: true, signed: true }) : '—'}
                      </div>
                      <div className="font-mono text-[9px] text-slate-500 truncate">
                        {week.trades > 0
                          ? `Disc ${week.disciplinePct.toFixed(0)}% · B:${formatCurrency(week.bestDay ?? 0, cur, { compact: true })}`
                          : 'No trades'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monthly Summary</h3>
              <BreakdownTable rows={monthlySummary} currency={cur} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Yearly Summary</h3>
              <BreakdownTable rows={yearlySummary} currency={cur} />
            </div>
          </div>
        </div>
      )}

      {tab === 'diagnostics' && (
        <div className="space-y-6">
          {/* MAE/MFE & Planned vs Actual R */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-7">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                MAE vs MFE Excursion Scatter ({cur})
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                High MFE with low realized P&L signals targets left on the table; high MAE on winners suggests tight stops or wide heat.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis type="number" dataKey="mae" name="MAE" tick={{ fontSize: 11 }} stroke="#64748B" />
                    <YAxis type="number" dataKey="mfe" name="MFE" tick={{ fontSize: 11 }} stroke="#64748B" />
                    <ZAxis range={[40, 40]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                    />
                    <Scatter data={diagnostics.maeMfePoints} fill="#3B82F6" isAnimationActive={false}>
                      {diagnostics.maeMfePoints.map((pt, i) => (
                        <Cell key={i} fill={pt.pnl >= 0 ? '#16A34A' : '#DC2626'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Planned R vs Actual R & Exit Efficiency
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-xs text-slate-500">Avg Planned R:R</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {metrics.avgPlannedRR ? `${metrics.avgPlannedRR.toFixed(2)}R` : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-xs text-slate-500">Avg Actual R</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatR(metrics.avgActualR)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 col-span-2">
                  <div className="text-xs text-slate-500">Winner Exit Efficiency (Realized / MFE)</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {metrics.exitEfficiencyPct !== null ? `${metrics.exitEfficiencyPct.toFixed(1)}%` : '—'}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {metrics.exitEfficiencyPct !== null && metrics.exitEfficiencyPct < 65
                      ? 'Winners give back >35% of peak open profit before closing.'
                      : 'Strong capture of favorable excursion on winning trades.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cost of Mistakes & Rules Followed vs Broken */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost of Mistakes</h3>
              {diagnostics.mistakeRows.length === 0 ? (
                <p className="text-xs text-slate-500">No mistake tags logged in this date range.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {diagnostics.mistakeRows.map((m) => (
                    <div key={m.tag} className="flex items-center justify-between py-2.5">
                      <div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{m.tag}</span>
                        <span className="ml-2 text-slate-500">({m.count} trades)</span>
                      </div>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          m.totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatCurrency(m.totalPnl, cur, { signed: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Rules Followed vs Rules Broken
              </h3>
              <BreakdownTable rows={diagnostics.rulesRows} currency={cur} />
            </div>
          </div>

          {/* Overtrading & Post-Consecutive-Loss & Emotion */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Overtrading Detection (Trades/Day vs P&L)
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {diagnostics.overtradingRows.map((o) => (
                  <div key={o.bucket} className="flex items-center justify-between py-2.5">
                    <span>
                      <strong className="text-slate-900 dark:text-slate-100">{o.bucket}</strong>{' '}
                      <span className="text-slate-500">({o.days} days · {o.trades} trades)</span>
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        o.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatCurrency(o.netPnl, cur, { signed: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Performance After Consecutive Losses
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {diagnostics.afterStreakRows.map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-2.5">
                    <span>
                      <strong className="text-slate-900 dark:text-slate-100">{s.label}</strong>{' '}
                      <span className="text-slate-500">({s.trades} trades · {s.winRate.toFixed(0)}% WR)</span>
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        s.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatCurrency(s.pnl, cur, { signed: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Emotion vs Outcome</h3>
            <BreakdownTable rows={diagnostics.emotionRows} currency={cur} />
          </div>
        </div>
      )}

      {tab === 'montecarlo' && (
        <div className="space-y-6">
          {!monteCarlo ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
              Need at least 5 closed trades to run a 1,000-path Monte Carlo equity simulation.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Risk of Ruin (25% DD)', `${monteCarlo.riskOfRuinPct.toFixed(1)}%`],
                  ['Median Final Equity (50t)', formatCurrency(monteCarlo.medianFinalEquity, cur)],
                  ['95th Pct (Best Path)', formatCurrency(monteCarlo.bestCaseFinalEquity, cur)],
                  ['5th Pct (Worst Path)', formatCurrency(monteCarlo.worstCaseFinalEquity, cur)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  1,000-Run Monte Carlo Projection (Next 50 Trades)
                </h3>
                <p className="mb-4 text-xs text-slate-500">
                  Bootstrapped with replacement from your empirical trade distribution. Shows 5th, 50th (median), and 95th percentile equity paths.
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monteCarlo.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                      <XAxis dataKey="step" tick={{ fontSize: 11 }} stroke="#64748B" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v) => formatCurrency(Number(v), cur, { compact: true })} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', fontSize: '12px', color: '#F8FAFC' }}
                        formatter={(v: unknown) => formatCurrency(Number(v), cur)}
                      />
                      <Area type="monotone" dataKey="p95" name="95th Pct (Best)" stroke="#16A34A" fill="#16A34A" fillOpacity={0.1} isAnimationActive={false} />
                      <Area type="monotone" dataKey="p50" name="50th Pct (Median)" stroke="#3B82F6" strokeWidth={2} fill="#3B82F6" fillOpacity={0.12} isAnimationActive={false} />
                      <Area type="monotone" dataKey="p5" name="5th Pct (Worst)" stroke="#DC2626" fill="#DC2626" fillOpacity={0.08} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
