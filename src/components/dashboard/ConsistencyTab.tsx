import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Account, HardRiskRules, Trade } from '../../types/trading';
import { calculateConsistencyMetrics } from '../../utils/calculations';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../ui/EmptyState';

interface ConsistencyTabProps {
  trades: Trade[];
  accountsMap: Map<string, Account>;
  displayCurrency: string;
  timeZone: string;
  hardRiskRules: HardRiskRules;
  onSelectDate: (dateKey: string) => void;
}

const RULE_PRESETS = [20, 25, 30, 40, 50] as const;
type TableMode = 'weekly' | 'daily';

export function ConsistencyTab({
  trades,
  accountsMap,
  displayCurrency,
  timeZone,
  hardRiskRules,
  onSelectDate,
}: ConsistencyTabProps) {
  const [maxDayShareRulePct, setMaxDayShareRulePct] = useState<number>(30);
  const [tableMode, setTableMode] = useState<TableMode>('weekly');

  const consistency = useMemo(
    () =>
      calculateConsistencyMetrics(
        trades,
        accountsMap,
        displayCurrency,
        timeZone,
        hardRiskRules,
        maxDayShareRulePct
      ),
    [trades, accountsMap, displayCurrency, timeZone, hardRiskRules, maxDayShareRulePct]
  );

  if (consistency.closedTrades === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No closed trades to analyze consistency"
        description="Close at least one trade to measure prop-firm day concentration, daily/weekly profit stability, and rule adherence."
      />
    );
  }

  const cur = displayCurrency;
  const bestDayShareDisplay =
    consistency.bestDaySharePct !== null ? `${consistency.bestDaySharePct.toFixed(1)}%` : 'N/A';

  const ruleComplianceOverall =
    (consistency.dailyLossLimitRespectedPct +
      consistency.dailyTradeCapRespectedPct +
      consistency.riskPerTradeRespectedPct) /
    3;

  const statusMeta = (() => {
    switch (consistency.ruleStatus) {
      case 'PASS':
        return {
          label: 'Compliant',
          icon: CheckCircle2,
          tone: 'text-emerald-600 dark:text-emerald-400',
          detail: `Best trading day (${consistency.bestDay?.dateKey ?? '—'}) contributed ${bestDayShareDisplay} of net profit, within the ${maxDayShareRulePct}% single-day cap.`,
        };
      case 'ABOVE_CAP':
        return {
          label: 'Above Day Cap',
          icon: AlertTriangle,
          tone: 'text-amber-600 dark:text-amber-400',
          detail: `Best day (${consistency.bestDay?.dateKey ?? '—'}, ${formatCurrency(
            consistency.bestDay?.netPnl ?? 0,
            cur,
            { signed: true }
          )}) is ${bestDayShareDisplay} of net profit. Need ${formatCurrency(
            consistency.additionalProfitNeeded,
            cur
          )} more cumulative profit across other days to drop below ${maxDayShareRulePct}%.`,
        };
      case 'INSUFFICIENT_DAYS':
        return {
          label: 'Single Day Only',
          icon: AlertTriangle,
          tone: 'text-amber-600 dark:text-amber-400',
          detail: `All closed trades fall on 1 trading day. Log profitable sessions across at least 2 days to satisfy a ${maxDayShareRulePct}% consistency cap.`,
        };
      default:
        return {
          label: 'No Net Profit',
          icon: XCircle,
          tone: 'text-red-600 dark:text-red-400',
          detail:
            consistency.bestDay && consistency.bestDay.netPnl > 0
              ? `Cumulative net P&L is ${formatCurrency(consistency.totalNetPnl, cur, {
                  signed: true,
                })}. Reach ${formatCurrency(consistency.requiredTotalProfit, cur)} total net profit (${formatCurrency(
                  consistency.additionalProfitNeeded,
                  cur
                )} needed) to keep your ${formatCurrency(
                  consistency.bestDay.netPnl,
                  cur
                )} best day within ${maxDayShareRulePct}%.`
              : `No profitable trading days recorded yet in this view.`,
        };
    }
  })();

  const StatusIcon = statusMeta.icon;

  const kpiCards = [
    {
      label: `Best Day Share (≤${maxDayShareRulePct}%)`,
      value: bestDayShareDisplay,
      sub: consistency.bestDay
        ? `${consistency.bestDay.dateKey} · ${formatCurrency(consistency.bestDay.netPnl, cur, {
            signed: true,
            compact: true,
          })}`
        : 'No positive day',
      tone:
        consistency.ruleStatus === 'PASS'
          ? 'pos'
          : consistency.ruleStatus === 'ABOVE_CAP' || consistency.ruleStatus === 'INSUFFICIENT_DAYS'
          ? 'warn'
          : 'neg',
    },
    {
      label: 'Green Day Rate',
      value: `${consistency.greenDayRatePct.toFixed(1)}%`,
      sub: `${consistency.greenDaysCount}G · ${consistency.redDaysCount}R · ${consistency.flatDaysCount}F (${consistency.activeDaysCount} days)`,
      tone: consistency.greenDayRatePct >= 50 ? 'pos' : 'neutral',
    },
    {
      label: 'Weekly Consistency',
      value: `${consistency.greenWeekRatePct.toFixed(1)}%`,
      sub: `${consistency.greenWeeks} of ${consistency.totalWeeks} active weeks profitable`,
      tone: consistency.greenWeekRatePct >= 50 ? 'pos' : 'neutral',
    },
    {
      label: 'Rule & Mistake-Free Rate',
      value: `${consistency.rulesFollowedPct.toFixed(1)}%`,
      sub: `Mistake-free ${consistency.noMistakeRatePct.toFixed(0)}% · Checklist ${
        consistency.checklistCompletionPct !== null
          ? `${consistency.checklistCompletionPct.toFixed(0)}%`
          : 'N/A'
      }`,
      tone: consistency.rulesFollowedPct >= 80 ? 'pos' : consistency.rulesFollowedPct >= 60 ? 'warn' : 'neg',
    },
    {
      label: 'Risk & Sizing Compliance',
      value: `${ruleComplianceOverall.toFixed(1)}%`,
      sub: `S/L attached ${consistency.validStopLossPct.toFixed(0)}% · Sizing ${consistency.sizingConsistencyPct.toFixed(0)}%`,
      tone: ruleComplianceOverall >= 85 ? 'pos' : ruleComplianceOverall >= 65 ? 'warn' : 'neg',
    },
  ];

  const habitRows = [
    {
      label: 'Rules Followed',
      detail: `${consistency.closedTrades} closed trades evaluated`,
      value: `${consistency.rulesFollowedPct.toFixed(1)}%`,
      ok: consistency.rulesFollowedPct >= 80,
    },
    {
      label: 'Checklist Completion',
      detail: 'Pre-trade checklist items checked',
      value:
        consistency.checklistCompletionPct !== null
          ? `${consistency.checklistCompletionPct.toFixed(1)}%`
          : 'Not Logged',
      ok: consistency.checklistCompletionPct === null || consistency.checklistCompletionPct >= 80,
    },
    {
      label: 'Valid Stop-Loss Attached',
      detail: 'Trades with protective S/L on risk side',
      value: `${consistency.validStopLossPct.toFixed(1)}%`,
      ok: consistency.validStopLossPct >= 80,
    },
    {
      label: `Max Risk / Trade (≤${hardRiskRules.maxRiskPerTradePct}%)`,
      detail: 'Trades respecting per-trade risk cap',
      value: `${consistency.riskPerTradeRespectedPct.toFixed(1)}%`,
      ok: consistency.riskPerTradeRespectedPct >= 90,
    },
    {
      label: `Daily Loss Cap (≤${formatCurrency(hardRiskRules.maxDailyLoss, cur)})`,
      detail: `Across ${consistency.activeDaysCount} active trading days`,
      value: `${consistency.dailyLossLimitRespectedPct.toFixed(1)}%`,
      ok: consistency.dailyLossLimitRespectedPct >= 90,
    },
    {
      label: `Daily Trade Cap (≤${hardRiskRules.maxTradesPerDay}/day)`,
      detail: 'Days without overtrading limit breach',
      value: `${consistency.dailyTradeCapRespectedPct.toFixed(1)}%`,
      ok: consistency.dailyTradeCapRespectedPct >= 85,
    },
    {
      label: 'Position Size Stability',
      detail:
        consistency.medianLotSize > 0
          ? `Within 0.5x–1.5x of ${consistency.medianLotSize} median size`
          : 'No size data',
      value: `${consistency.sizingConsistencyPct.toFixed(1)}%`,
      ok: consistency.sizingConsistencyPct >= 75,
    },
    {
      label: 'Daily P&L Avg (Green / Red)',
      detail: `Std dev ${formatCurrency(consistency.dailyPnlStdDev, cur)} · Streaks +${consistency.longestGreenDayStreak}D / -${consistency.longestRedDayStreak}D`,
      value: `${formatCurrency(consistency.avgGreenDay, cur, { compact: true })} / ${formatCurrency(
        consistency.avgRedDay,
        cur,
        { compact: true }
      )}`,
      ok: consistency.avgGreenDay >= consistency.avgRedDay,
    },
  ];

  const recentDailyRowsDesc = consistency.dailyRows.slice().reverse();

  return (
    <div className="space-y-6">
      {/* Prop-Firm Consistency Rule Analyzer */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 shrink-0 ${statusMeta.tone}`} />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Single-Day Consistency Rule
              </h3>
              <span className="text-xs text-slate-400 dark:text-slate-600">·</span>
              <span className={`font-mono text-xs font-semibold ${statusMeta.tone}`}>
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{statusMeta.detail}</p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1 shrink-0 w-fit">
            <span className="px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Cap
            </span>
            {RULE_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setMaxDayShareRulePct(pct)}
                className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  maxDayShareRulePct === pct
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 Consistency KPIs */}
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
                  : k.tone === 'warn'
                  ? 'text-amber-600 dark:text-amber-400'
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

      {/* Charts: Daily Net P&L Concentration + Rolling 5-Trade Stability */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily P&L & Profit Concentration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {consistency.activeDaysCount} active trading days · Top day highlighted
              </p>
            </div>
            <div className="text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {consistency.bestDaySharePct !== null
                ? `Best day ${consistency.bestDaySharePct.toFixed(1)}% of net`
                : 'Net P&L ≤ 0'}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={consistency.dailyRows.slice(-45)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="dateKey"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickFormatter={(v) => formatCurrency(v, cur, { compact: true })}
                  width={68}
                />
                <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                  formatter={(v: unknown, _name: unknown, item: { payload?: { shareOfProfitPct?: number; trades?: number } }) => {
                    const share = item?.payload?.shareOfProfitPct ?? 0;
                    const tr = item?.payload?.trades ?? 0;
                    return [
                      `${formatCurrency(Number(v), cur, { signed: true })} (${share.toFixed(1)}% share · ${tr} trades)`,
                      'Daily P&L',
                    ];
                  }}
                />
                <Bar dataKey="netPnl" isAnimationActive={false}>
                  {consistency.dailyRows.slice(-45).map((d) => {
                    let fill = d.netPnl >= 0 ? '#16A34A' : '#DC2626';
                    if (d.isBestDay) {
                      fill =
                        consistency.ruleStatus === 'ABOVE_CAP' ? '#D97706' : '#2563EB';
                    }
                    return <Cell key={d.dateKey} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Rolling 5-Trade Stability
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Win Rate % vs Rules Followed % across executions
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="text-blue-600 dark:text-blue-400">Win %</span>
              <span className="text-emerald-600 dark:text-emerald-400">Rules %</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={consistency.rollingWindows}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  tickFormatter={(v) => `#${v}`}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickFormatter={(v) => `${v}%`}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                  labelFormatter={(v) => `Trade #${v}`}
                  formatter={(v: unknown, name: unknown) => [
                    `${Number(v).toFixed(0)}%`,
                    name === 'rollingWinRatePct' ? 'Rolling Win Rate' : 'Rolling Rules %',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="rollingWinRatePct"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="rollingRulesPct"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Process & Risk Habit Ledger + Weekly / Daily Consistency Breakdown */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Execution & Risk Consistency
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adherence to configured risk rules and sizing discipline
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {habitRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {row.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {row.detail}
                  </div>
                </div>
                <div
                  className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                    row.ok
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {tableMode === 'weekly' ? 'Weekly Consistency Log' : 'Daily Contribution Log'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tableMode === 'weekly'
                  ? `${consistency.greenWeeks} profitable out of ${consistency.totalWeeks} active weeks`
                  : 'Click any trading day to inspect individual executions'}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setTableMode('weekly')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tableMode === 'weekly'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                By Week
              </button>
              <button
                type="button"
                onClick={() => setTableMode('daily')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tableMode === 'daily'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                By Day
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            {tableMode === 'weekly' ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">Week</th>
                    <th className="pb-2 font-medium text-right">Days</th>
                    <th className="pb-2 font-medium text-right">Trades</th>
                    <th className="pb-2 font-medium text-right">Win %</th>
                    <th className="pb-2 font-medium text-right">Rules %</th>
                    <th className="pb-2 font-medium text-right">Cap Breaches</th>
                    <th className="pb-2 font-medium text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {consistency.weeklyRows.map((w) => (
                    <tr key={w.weekId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <span className="font-mono text-slate-500 dark:text-slate-400 mr-1.5">
                          {w.weekId}
                        </span>
                        <span>{w.weekLabel}</span>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {w.activeDays}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {w.trades}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {w.winRate.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {w.rulesFollowedPct.toFixed(0)}%
                      </td>
                      <td
                        className={`py-2 text-right font-mono tabular-nums ${
                          w.dailyBreachesCount > 0
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {w.dailyBreachesCount}
                      </td>
                      <td
                        className={`py-2 text-right font-mono font-semibold tabular-nums ${
                          w.netPnl >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatCurrency(w.netPnl, cur, { signed: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Trades</th>
                    <th className="pb-2 font-medium text-right">W / L</th>
                    <th className="pb-2 font-medium text-right">Profit Share</th>
                    <th className="pb-2 font-medium text-right">Rules %</th>
                    <th className="pb-2 font-medium text-right">Limits</th>
                    <th className="pb-2 font-medium text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {recentDailyRowsDesc.map((d) => {
                    const capFlag =
                      d.dailyLossBreached && d.dailyTradeCapBreached
                        ? 'Loss + Cap'
                        : d.dailyLossBreached
                        ? 'Loss Cap'
                        : d.dailyTradeCapBreached
                        ? 'Trade Cap'
                        : 'OK';
                    return (
                      <tr
                        key={d.dateKey}
                        onClick={() => onSelectDate(d.dateKey)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-2 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {d.dateKey}
                          {d.isBestDay && (
                            <span className="ml-1.5 text-[11px] font-sans text-blue-600 dark:text-blue-400">
                              · Top
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {d.trades}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {d.wins}W / {d.losses}L
                        </td>
                        <td
                          className={`py-2 text-right font-mono tabular-nums ${
                            d.shareOfProfitPct > maxDayShareRulePct
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {d.shareOfProfitPct > 0 ? `${d.shareOfProfitPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {d.rulesFollowedPct.toFixed(0)}%
                        </td>
                        <td
                          className={`py-2 text-right font-mono text-[11px] ${
                            capFlag === 'OK'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400 font-semibold'
                          }`}
                        >
                          {capFlag}
                        </td>
                        <td
                          className={`py-2 text-right font-mono font-semibold tabular-nums ${
                            d.netPnl >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatCurrency(d.netPnl, cur, { signed: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
