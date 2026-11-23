import React, { useEffect, useMemo, useState } from 'react';
import { Brain, CalendarRange, ChevronLeft, ChevronRight, History, Loader2, Save } from 'lucide-react';
import { PairPlansSection } from '../components/ui/PairPlansSection';
import { useJournal } from '../context/JournalContext';
import { PairPlanEntry, WeeklyPlan } from '../types/trading';
import { calculatePerformance, getTradePnlInDisplayCurrency } from '../utils/calculations';
import { formatCurrency } from '../utils/currency';
import {
  getDateKeyInTimezone,
  getTodayKeyInTimezone,
  getWeekBoundsFromDateKey,
  getWeekIdFromDateKey,
  shiftDateKey,
} from '../utils/timezone';

export function WeeklyPlanPage() {
  const {
    accounts,
    liveTrades,
    selectedAccountId,
    weeklyPlans,
    settings,
    saveWeeklyPlan,
    pushToast,
  } = useJournal();

  const [anchorDate, setAnchorDate] = useState(getTodayKeyInTimezone(settings.timezone));
  const weekId = getWeekIdFromDateKey(anchorDate);
  const { weekStart, weekEnd } = getWeekBoundsFromDateKey(anchorDate);

  const existing = useMemo(() => weeklyPlans.find((w) => w.id === weekId), [weeklyPlans, weekId]);

  const [marketBias, setMarketBias] = useState('');
  const [keyLevels, setKeyLevels] = useState('');
  const [economicEvents, setEconomicEvents] = useState('');
  const [focusInstruments, setFocusInstruments] = useState('');
  const [pnlGoal, setPnlGoal] = useState('1500');
  const [processGoal, setProcessGoal] = useState('');
  const [maxWeeklyLoss, setMaxWeeklyLoss] = useState('1000');
  const [maxTrades, setMaxTrades] = useState('15');
  const [whatWorked, setWhatWorked] = useState('');
  const [whatToImprove, setWhatToImprove] = useState('');
  const [selfRating, setSelfRating] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pairPlans, setPairPlans] = useState<PairPlanEntry[]>([]);

  useEffect(() => {
    if (existing) {
      setMarketBias(existing.marketBias);
      setKeyLevels(existing.keyLevels);
      setEconomicEvents(existing.economicEvents);
      setFocusInstruments(existing.focusInstruments.join(', '));
      setPnlGoal(String(existing.pnlGoal));
      setProcessGoal(existing.processGoal);
      setMaxWeeklyLoss(String(existing.maxWeeklyLoss));
      setMaxTrades(String(existing.maxTrades));
      setWhatWorked(existing.whatWorked);
      setWhatToImprove(existing.whatToImprove);
      setSelfRating(existing.selfRating);
      setAiSummary(existing.aiSummary ?? '');
      setPairPlans(existing.pairPlans ?? []);
    } else {
      setMarketBias('');
      setKeyLevels('');
      setEconomicEvents('');
      setFocusInstruments('');
      setPnlGoal('1500');
      setProcessGoal('');
      setMaxWeeklyLoss('1000');
      setMaxTrades('15');
      setWhatWorked('');
      setWhatToImprove('');
      setSelfRating(4);
      setAiSummary('');
      setPairPlans([]);
    }
  }, [existing, weekId]);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const weekTrades = useMemo(() => {
    return liveTrades.filter((t) => {
      if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) return false;
      const dk = getDateKeyInTimezone(t.openTime, settings.timezone);
      return dk >= weekStart && dk <= weekEnd;
    });
  }, [liveTrades, selectedAccountId, settings.timezone, weekStart, weekEnd]);

  const { metrics } = useMemo(
    () => calculatePerformance(weekTrades, 10000, accountsMap, settings.displayCurrency, settings.timezone),
    [weekTrades, accountsMap, settings.displayCurrency, settings.timezone]
  );

  const cur = settings.displayCurrency;
  const maxTradesNum = parseInt(maxTrades, 10) || 0;
  const maxLossNum = parseFloat(maxWeeklyLoss) || 0;
  const pnlGoalNum = parseFloat(pnlGoal) || 0;

  const suggestedInstruments = useMemo(() => {
    const fromFocus = focusInstruments
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const fromTrades = Array.from(new Set(liveTrades.slice(0, 40).map((t) => t.instrument.toUpperCase())));
    return Array.from(new Set([...fromFocus, ...fromTrades]));
  }, [focusInstruments, liveTrades]);

  const savedHistory = useMemo(() => {
    return [...weeklyPlans]
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .map((plan) => {
        const planTrades = liveTrades.filter((t) => {
          if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) return false;
          const dk = getDateKeyInTimezone(t.openTime, settings.timezone);
          return dk >= plan.weekStart && dk <= plan.weekEnd;
        });
        const pnl = planTrades.reduce((s, t) => s + getTradePnlInDisplayCurrency(t, accountsMap, cur), 0);
        const pairs = plan.pairPlans ?? [];
        const preShots = pairs.filter((p) => Boolean(p.preScreenshot)).length;
        const afterShots = pairs.filter((p) => Boolean(p.afterScreenshot)).length;
        return { plan, pnl, tradeCount: planTrades.length, pairs, preShots, afterShots };
      });
  }, [weeklyPlans, liveTrades, selectedAccountId, settings.timezone, accountsMap, cur]);

  const buildPlanObj = (summaryOverride?: string): WeeklyPlan => ({
    id: weekId,
    weekStart,
    weekEnd,
    marketBias,
    keyLevels,
    economicEvents,
    focusInstruments: focusInstruments
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    pnlGoal: pnlGoalNum,
    processGoal,
    maxWeeklyLoss: maxLossNum,
    maxTrades: maxTradesNum,
    whatWorked,
    whatToImprove,
    selfRating,
    aiSummary: summaryOverride !== undefined ? summaryOverride : aiSummary,
    pairPlans,
    updatedAt: new Date().toISOString(),
  });

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await saveWeeklyPlan(buildPlanObj());
    pushToast('success', `Saved Weekly Plan (${weekId}).`);
  };

  const handleAiSummary = async () => {
    setAiLoading(true);
    try {
      const planObj = buildPlanObj();
      const compactWeekPlan = {
        ...planObj,
        pairPlans: (planObj.pairPlans ?? []).map(({ preScreenshot, afterScreenshot, ...rest }) => ({
          ...rest,
          hasPreChart: Boolean(preScreenshot),
          hasAfterChart: Boolean(afterScreenshot),
        })),
      };
      const res = await fetch('/api/ai/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekPlan: compactWeekPlan,
          actualStats: metrics,
          tradesSummary: {
            totalTrades: weekTrades.length,
            rulesFollowed: weekTrades.filter((t) => t.rulesFollowed).length,
            mistakes: weekTrades.flatMap((t) => t.mistakeTags),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI weekly summary');
      setAiSummary(data.summary);
      await saveWeeklyPlan(buildPlanObj(data.summary));
      pushToast('success', 'Generated AI end-of-week summary.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'AI summary failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Week Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-3">
          <CalendarRange className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
              {weekId}
            </h2>
            <p className="font-mono text-xs text-slate-500">
              {weekStart} → {weekEnd}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchorDate(shiftDateKey(anchorDate, -7))}
            className="rounded-lg border border-slate-300 dark:border-slate-700 p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(getTodayKeyInTimezone(settings.timezone))}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium"
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(shiftDateKey(anchorDate, 7))}
            className="rounded-lg border border-slate-300 dark:border-slate-700 p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Plan vs Actual Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Actual P&L vs Goal</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums">
            <span className={metrics.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {formatCurrency(metrics.netPnl, cur, { signed: true })}
            </span>
            <span className="text-xs font-normal text-slate-500"> / {formatCurrency(pnlGoalNum, cur)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Trades vs Max Cap</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {weekTrades.length}{' '}
            <span className="text-xs font-normal text-slate-500">/ {maxTradesNum || '∞'}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Max Weekly Loss Limit</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(maxLossNum, cur)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Week Win Rate / PF</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {metrics.winRate.toFixed(1)}% · PF {Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : '∞'}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-2">
        {/* Pre-Week Plan */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pre-Week Preparation</h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Higher-Timeframe Market Bias
            </label>
            <textarea
              rows={2}
              value={marketBias}
              onChange={(e) => setMarketBias(e.target.value)}
              placeholder="DXY, BTC, SPX directional narrative..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Key Liquidity & Structural Levels
            </label>
            <textarea
              rows={2}
              value={keyLevels}
              onChange={(e) => setKeyLevels(e.target.value)}
              placeholder="EURUSD 1.0800 / 1.0920 | BTC 90k / 94k..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              High-Impact Economic Events
            </label>
            <input
              type="text"
              value={economicEvents}
              onChange={(e) => setEconomicEvents(e.target.value)}
              placeholder="CPI, FOMC, NFP, Earnings..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Instruments to Focus On (comma-separated)
            </label>
            <input
              type="text"
              value={focusInstruments}
              onChange={(e) => setFocusInstruments(e.target.value)}
              placeholder="EURUSD, XAUUSD, BTCUSDT, NVDA"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm uppercase"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">P&L Goal ({cur})</label>
              <input
                type="number"
                value={pnlGoal}
                onChange={(e) => setPnlGoal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Loss ({cur})</label>
              <input
                type="number"
                value={maxWeeklyLoss}
                onChange={(e) => setMaxWeeklyLoss(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Trades</label>
              <input
                type="number"
                value={maxTrades}
                onChange={(e) => setMaxTrades(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Primary Process Goal
            </label>
            <input
              type="text"
              value={processGoal}
              onChange={(e) => setProcessGoal(e.target.value)}
              placeholder="e.g. Zero impulse entries outside A+ playbook triggers"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* End of Week Review & AI Summary */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">End-of-Week Review</h3>
              <button
                type="button"
                onClick={() => void handleAiSummary()}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                AI Summary
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                What Worked
              </label>
              <textarea
                rows={2}
                value={whatWorked}
                onChange={(e) => setWhatWorked(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                What to Improve
              </label>
              <textarea
                rows={2}
                value={whatToImprove}
                onChange={(e) => setWhatToImprove(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Self-Rating (1–5)
              </label>
              <div className="flex gap-2">
                {([1, 2, 3, 4, 5] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelfRating(r)}
                    className={`h-9 w-10 rounded-lg font-mono text-sm font-semibold transition-colors ${
                      selfRating === r
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {aiSummary && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                <div className="mb-1 font-semibold text-slate-900 dark:text-slate-100">AI Weekly Audit</div>
                {aiSummary}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save Weekly Plan
          </button>
        </div>

        {/* Per-Pair Before / After Charts & Notes */}
        <div className="lg:col-span-2 space-y-3">
          <PairPlansSection
            mode="weekly"
            pairPlans={pairPlans}
            onChange={setPairPlans}
            suggestedInstruments={suggestedInstruments}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Save className="h-3.5 w-3.5" />
              Save Weekly Plan & Pair Charts
            </button>
          </div>
        </div>
      </form>

      {/* Saved Weekly Plan Records */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Saved Weekly Plan Records ({savedHistory.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">Click any week to inspect before/after charts and outcomes</span>
        </div>

        {savedHistory.length === 0 ? (
          <p className="py-4 text-xs text-slate-500">
            No weekly plans saved yet. Fill in your pre-week plan and pair charts above, then click Save Weekly Plan.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {savedHistory.map(({ plan, pnl, tradeCount, pairs, preShots, afterShots }) => {
              const isCurrent = plan.id === weekId;
              const pairList = pairs.map((p) => p.instrument).join(', ');
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setAnchorDate(plan.weekStart)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left transition-colors rounded-lg ${
                    isCurrent
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {plan.id}
                      </span>
                      <span className="font-mono text-slate-500">
                        {plan.weekStart} → {plan.weekEnd}
                      </span>
                      {isCurrent && (
                        <span className="font-medium text-blue-600 dark:text-blue-400">· Viewing</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {pairs.length > 0
                        ? `${pairs.length} pairs (${pairList}) · ${preShots} before / ${afterShots} after charts`
                        : plan.focusInstruments.length > 0
                        ? `Focus: ${plan.focusInstruments.join(', ')}`
                        : plan.marketBias || 'No pair charts attached yet'}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right font-mono text-xs tabular-nums shrink-0">
                    <span className="text-slate-500">{tradeCount} trades</span>
                    <span className="text-slate-600 dark:text-slate-300">Rating {plan.selfRating}/5</span>
                    <span
                      className={`font-semibold ${
                        pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatCurrency(pnl, cur, { signed: true })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
