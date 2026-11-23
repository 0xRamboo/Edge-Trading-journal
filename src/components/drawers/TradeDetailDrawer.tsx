import React, { useMemo, useState } from 'react';
import { Brain, Edit3, Loader2, Trash2, X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { calculatePerformance } from '../../utils/calculations';
import { formatCurrency, formatR } from '../../utils/currency';
import { formatDateTimeInTimezone, formatHoldingTime } from '../../utils/timezone';

export function TradeDetailDrawer() {
  const {
    trades,
    liveTrades,
    accounts,
    strategies,
    settings,
    drawerTradeId,
    setDrawerTradeId,
    openTradeModal,
    deleteTrade,
    saveTrade,
    pushToast,
  } = useJournal();

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const trade = useMemo(() => trades.find((t) => t.id === drawerTradeId) ?? null, [trades, drawerTradeId]);
  const account = accounts.find((a) => a.id === trade?.accountId);
  const strategy = strategies.find((s) => s.id === trade?.strategyId);

  const baselineStats = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a]));
    return calculatePerformance(liveTrades, 10000, map, settings.displayCurrency, settings.timezone).metrics;
  }, [liveTrades, accounts, settings.displayCurrency, settings.timezone]);

  if (!trade) return null;

  const isWin = trade.netPnl >= 0;

  const handleAiReview = async () => {
    setReviewLoading(true);
    setReviewError('');
    try {
      const res = await fetch('/api/ai/review-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade,
          accountName: account?.name ?? 'Unknown',
          strategyName: strategy?.name ?? 'Unassigned',
          baselineStats: {
            winRate: baselineStats.winRate,
            profitFactor: Number.isFinite(baselineStats.profitFactor) ? baselineStats.profitFactor : 'Inf',
            averageR: baselineStats.averageR,
            expectancyCurrency: baselineStats.expectancyCurrency,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI review request failed');
      await saveTrade({ ...trade, aiReview: data.review, updatedAt: new Date().toISOString() });
      pushToast('success', 'AI trade review generated and saved.');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to generate review');
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                {trade.instrument}
              </h2>
              <span
                className={`text-xs font-semibold ${
                  trade.direction === 'LONG'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {trade.direction}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {account?.name ?? 'Account'} · {trade.session}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {formatDateTimeInTimezone(trade.openTime, settings.timezone)} →{' '}
              {trade.status === 'OPEN' ? 'OPEN' : formatDateTimeInTimezone(trade.closeTime, settings.timezone)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDrawerTradeId(null);
                openTradeModal(trade, trade.backtestSessionId ?? null);
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              title="Edit Trade"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteTrade(trade.id);
                pushToast('info', `Deleted ${trade.instrument} trade.`);
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600"
              title="Delete Trade"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDrawerTradeId(null)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Primary Result Strip */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Net P&L</div>
              <div
                className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                  trade.status === 'OPEN'
                    ? 'text-slate-700 dark:text-slate-300'
                    : isWin
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {trade.status === 'OPEN'
                  ? 'OPEN'
                  : formatCurrency(trade.netPnl, account?.currency || 'USD', { signed: true })}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Actual R / Planned</div>
              <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatR(trade.actualR)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {trade.plannedRR ? `${trade.plannedRR.toFixed(2)}R` : '—'}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Initial Risk</div>
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {trade.initialRiskAmount !== null
                  ? formatCurrency(trade.initialRiskAmount, account?.currency || 'USD')
                  : 'No SL'}
                {trade.initialRiskPct !== null ? ` (${trade.initialRiskPct}%)` : ''}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Holding Time</div>
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatHoldingTime(trade.holdingTimeMinutes)}
              </div>
            </div>
          </div>

          {/* Execution Grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-sm sm:grid-cols-3">
            {[
              ['Entry Price', trade.entryPrice],
              ['Exit Price', trade.exitPrice ?? '—'],
              ['Stop Loss', trade.stopLoss ?? '—'],
              ['Take Profit', trade.takeProfit ?? '—'],
              ['Size / Volume', trade.size],
              ['Fees + Comm + Swap', formatCurrency(trade.fees + trade.commission + trade.swap, account?.currency || 'USD')],
              ['MAE', trade.mae !== null ? formatCurrency(trade.mae, account?.currency || 'USD') : '—'],
              ['MFE', trade.mfe !== null ? formatCurrency(trade.mfe, account?.currency || 'USD') : '—'],
              ['Strategy', strategy?.name || 'Unassigned'],
              ['Setup', trade.setup || '—'],
              ['Market Condition', trade.marketCondition || '—'],
              ['Rules Followed', trade.rulesFollowed ? 'Yes' : 'No (Broken)'],
            ].map(([label, val]) => (
              <div key={String(label)}>
                <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                <div className="mt-0.5 font-mono text-xs font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {String(val)}
                </div>
              </div>
            ))}
          </div>

          {/* Emotion Timeline & Checklist */}
          <div className="grid gap-4 border-t border-slate-200 dark:border-slate-800 pt-4 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">Emotion Timeline</h4>
              <div className="space-y-1.5 text-xs">
                {[
                  ['Before Entry', trade.emotionBefore],
                  ['During Trade', trade.emotionDuring],
                  ['After Exit', trade.emotionAfter],
                ].map(([stage, emo]) => {
                  const eObj = emo as { score: number; tag: string };
                  return (
                    <div key={String(stage)} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>{String(stage)}</span>
                      <span className="font-mono">
                        {eObj.score}/5 · {eObj.tag}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Checklist & Tags
              </h4>
              <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <div>
                  Pre-Trade Checklist:{' '}
                  <span className="font-mono font-semibold">
                    {trade.checklistResult?.completed ?? 0}/{trade.checklistResult?.total ?? 0}
                  </span>{' '}
                  ({trade.checklistResult?.requiredPassed ? 'Required Passed' : 'Required Missed'})
                </div>
                <div>
                  Mistakes:{' '}
                  {trade.mistakeTags.length > 0 ? (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      {trade.mistakeTags.join(' · ')}
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">None logged</span>
                  )}
                </div>
                {trade.customTags.length > 0 && (
                  <div className="text-slate-500">Tags: {trade.customTags.map((t) => `#${t}`).join(' ')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {trade.notes && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Trader Notes</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {trade.notes}
              </p>
            </div>
          )}

          {/* Screenshots Gallery */}
          {trade.screenshots.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Screenshots ({trade.screenshots.length})
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {trade.screenshots.map((ss) => (
                  <div key={ss.id} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-medium capitalize text-slate-600 dark:text-slate-400">
                      {ss.stage}
                    </div>
                    <img src={ss.dataUrl} alt={`${ss.stage} screenshot`} className="w-full object-contain max-h-64" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Review of This Trade */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Brain className="h-4 w-4 text-blue-500" />
                AI Review of This Trade
              </h4>
              <button
                type="button"
                onClick={() => void handleAiReview()}
                disabled={reviewLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                {trade.aiReview ? 'Regenerate Review' : 'AI Review of This Trade'}
              </button>
            </div>

            {reviewError && (
              <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                {reviewError}
              </div>
            )}

            {trade.aiReview ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {trade.aiReview}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click "AI Review of This Trade" for a quantitative critique of R-multiple execution, exit efficiency, and rule adherence.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
