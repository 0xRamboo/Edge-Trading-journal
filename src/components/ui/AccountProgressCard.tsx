import React, { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Account, Trade } from '../../types/trading';
import { calculatePerformance } from '../../utils/calculations';
import { formatCurrency, formatPercent } from '../../utils/currency';

interface AccountProgressCardProps {
  account: Account;
  trades: Trade[];
  timeZone: string;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
}

export function AccountProgressCard({
  account,
  trades,
  timeZone,
  selected,
  onSelect,
  onEdit,
}: AccountProgressCardProps) {
  const accTrades = useMemo(
    () => trades.filter((t) => t.accountId === account.id && !t.isBacktest),
    [trades, account.id]
  );

  const accountsMap = useMemo(() => new Map([[account.id, account]]), [account]);

  const { metrics, equityCurve } = useMemo(
    () => calculatePerformance(accTrades, account.startingBalance, accountsMap, account.currency, timeZone),
    [accTrades, account.startingBalance, accountsMap, account.currency, timeZone]
  );

  const currentBalance = account.startingBalance + metrics.netPnl;
  const growthPct = account.startingBalance > 0 ? (metrics.netPnl / account.startingBalance) * 100 : 0;
  const isPositive = metrics.netPnl >= 0;

  const sparkData = useMemo(() => {
    if (equityCurve.length === 0) {
      return [{ i: 0, v: account.startingBalance }, { i: 1, v: account.startingBalance }];
    }
    return [
      { i: 0, v: account.startingBalance },
      ...equityCurve.map((p, idx) => ({ i: idx + 1, v: p.equity })),
    ];
  }, [equityCurve, account.startingBalance]);

  const strokeColor = isPositive ? '#16A34A' : '#DC2626';

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-4 transition-colors ${
        onSelect ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {account.name}
            </h4>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            {account.broker} · {account.type.toUpperCase()} · {account.currency}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {formatCurrency(currentBalance, account.currency)}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-xs tabular-nums">
            <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {formatCurrency(metrics.netPnl, account.currency, { signed: true })}
            </span>
            <span className="text-slate-400">·</span>
            <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {formatPercent(growthPct, true)}
            </span>
          </div>
        </div>

        <div className="h-11 w-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area
                type="monotone"
                dataKey="v"
                stroke={strokeColor}
                strokeWidth={1.75}
                fill={strokeColor}
                fillOpacity={0.14}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
        <span>WR {metrics.winRate.toFixed(1)}%</span>
        <span>Max DD {metrics.maxDrawdownPct.toFixed(1)}%</span>
        <span>{metrics.closedTrades} trades</span>
      </div>
    </div>
  );
}
