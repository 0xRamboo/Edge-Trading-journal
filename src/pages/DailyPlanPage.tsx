import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, Calendar, History, Lock, Save } from 'lucide-react';
import { PairPlansSection } from '../components/ui/PairPlansSection';
import { useJournal } from '../context/JournalContext';
import { DailyPlan, PairPlanEntry } from '../types/trading';
import { getTradePnlInDisplayCurrency } from '../utils/calculations';
import { formatCurrency, formatR } from '../utils/currency';
import { getDateKeyInTimezone, getTodayKeyInTimezone } from '../utils/timezone';

export function DailyPlanPage() {
  const {
    accounts,
    liveTrades,
    selectedAccountId,
    dailyPlans,
    settings,
    saveDailyPlan,
    setDrawerTradeId,
    pushToast,
  } = useJournal();

  const [dateKey, setDateKey] = useState(getTodayKeyInTimezone(settings.timezone));
  const existing = useMemo(() => dailyPlans.find((d) => d.dateKey === dateKey), [dailyPlans, dateKey]);

  const [bias, setBias] = useState('');
  const [levels, setLevels] = useState('');
  const [news, setNews] = useState('');
  const [aPlusSetups, setAPlusSetups] = useState('');
  const [maxTrades, setMaxTrades] = useState(String(settings.hardRiskRules.maxTradesPerDay || 3));
  const [maxDailyLoss, setMaxDailyLoss] = useState(String(settings.hardRiskRules.maxDailyLoss || 600));
  const [dailyGoal, setDailyGoal] = useState('');
  const [eodFollowedPlan, setEodFollowedPlan] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [bestDecision, setBestDecision] = useState('');
  const [worstDecision, setWorstDecision] = useState('');
  const [emotionSummary, setEmotionSummary] = useState('');
  const [pairPlans, setPairPlans] = useState<PairPlanEntry[]>([]);

  useEffect(() => {
    if (existing) {
      setBias(existing.bias);
      setLevels(existing.levels);
      setNews(existing.news);
      setAPlusSetups(existing.aPlusSetups);
      setMaxTrades(String(existing.maxTrades));
      setMaxDailyLoss(String(existing.maxDailyLoss));
      setDailyGoal(existing.dailyGoal);
      setEodFollowedPlan(existing.eodFollowedPlan);
      setBestDecision(existing.bestDecision);
      setWorstDecision(existing.worstDecision);
      setEmotionSummary(existing.emotionSummary);
      setPairPlans(existing.pairPlans ?? []);
    } else {
      setBias('');
      setLevels('');
      setNews('');
      setAPlusSetups('');
      setMaxTrades(String(settings.hardRiskRules.maxTradesPerDay || 3));
      setMaxDailyLoss(String(settings.hardRiskRules.maxDailyLoss || 600));
      setDailyGoal('');
      setEodFollowedPlan(4);
      setBestDecision('');
      setWorstDecision('');
      setEmotionSummary('');
      setPairPlans([]);
    }
  }, [existing, dateKey, settings.hardRiskRules]);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const dayTrades = useMemo(() => {
    return liveTrades.filter((t) => {
      if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) return false;
      return getDateKeyInTimezone(t.openTime, settings.timezone) === dateKey;
    });
  }, [liveTrades, selectedAccountId, settings.timezone, dateKey]);

  const cur = settings.displayCurrency;
  const dayNetPnl = dayTrades.reduce((s, t) => s + getTradePnlInDisplayCurrency(t, accountsMap, cur), 0);
  const lossUsed = dayNetPnl < 0 ? Math.abs(dayNetPnl) : 0;
  const maxTradesLimit = parseInt(maxTrades, 10) || 0;
  const maxLossLimit = parseFloat(maxDailyLoss) || 0;

  const tradesLimitHit = maxTradesLimit > 0 && dayTrades.length >= maxTradesLimit;
  const lossLimitHit = maxLossLimit > 0 && lossUsed >= maxLossLimit;

  const suggestedInstruments = useMemo(() => {
    const todayInstruments = dayTrades.map((t) => t.instrument.toUpperCase());
    const recentInstruments = liveTrades.slice(0, 30).map((t) => t.instrument.toUpperCase());
    return Array.from(new Set([...todayInstruments, ...recentInstruments]));
  }, [dayTrades, liveTrades]);

  const savedHistory = useMemo(() => {
    return [...dailyPlans]
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .map((plan) => {
        const planTrades = liveTrades.filter((t) => {
          if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) return false;
          return getDateKeyInTimezone(t.openTime, settings.timezone) === plan.dateKey;
        });
        const pnl = planTrades.reduce((s, t) => s + getTradePnlInDisplayCurrency(t, accountsMap, cur), 0);
        const pairs = plan.pairPlans ?? [];
        const preShots = pairs.filter((p) => Boolean(p.preScreenshot)).length;
        const afterShots = pairs.filter((p) => Boolean(p.afterScreenshot)).length;
        return { plan, pnl, tradeCount: planTrades.length, pairs, preShots, afterShots };
      });
  }, [dailyPlans, liveTrades, selectedAccountId, settings.timezone, accountsMap, cur]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const plan: DailyPlan = {
      dateKey,
      bias,
      levels,
      news,
      aPlusSetups,
      maxTrades: maxTradesLimit,
      maxDailyLoss: maxLossLimit,
      dailyGoal,
      eodFollowedPlan,
      bestDecision,
      worstDecision,
      emotionSummary,
      pairPlans,
      updatedAt: new Date().toISOString(),
    };
    await saveDailyPlan(plan);
    pushToast('success', `Saved Daily Plan for ${dateKey}.`);
  };

  return (
    <div className="space-y-6">
      {/* Header + Date */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Daily Execution Plan</h2>
            <p className="text-xs text-slate-500">Pre-market preparation, live limit guardrails, and EOD review.</p>
          </div>
        </div>
        <input
          type="date"
          value={dateKey}
          onChange={(e) => setDateKey(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 font-mono text-xs"
        />
      </div>

      {/* Live Limit Status Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span>Trades Taken Today</span>
              <span className="font-mono font-semibold tabular-nums">
                {dayTrades.length} / {maxTradesLimit || '∞'}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${tradesLimitHit ? 'bg-red-600' : 'bg-blue-600'}`}
                style={{
                  width: `${maxTradesLimit > 0 ? Math.min(100, (dayTrades.length / maxTradesLimit) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span>Daily Loss Used</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatCurrency(lossUsed, cur)} / {formatCurrency(maxLossLimit, cur)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${lossLimitHit ? 'bg-red-600' : 'bg-amber-500'}`}
                style={{
                  width: `${maxLossLimit > 0 ? Math.min(100, (lossUsed / maxLossLimit) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-500">Today Net P&L</div>
              <div
                className={`font-mono text-base font-bold tabular-nums ${
                  dayNetPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatCurrency(dayNetPnl, cur, { signed: true })}
              </div>
            </div>
          </div>
        </div>

        {(tradesLimitHit || lossLimitHit) && (
          <div className="flex items-center gap-3 rounded-lg border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
            {lossLimitHit ? <Lock className="h-4 w-4 shrink-0" /> : <AlertOctagon className="h-4 w-4 shrink-0" />}
            <div>
              <strong>Daily Risk Lock Triggered:</strong>{' '}
              {lossLimitHit
                ? `You have reached your max daily loss of ${formatCurrency(maxLossLimit, cur)}. Step away from the terminal.`
                : `You have reached your ${maxTradesLimit}-trade daily cap. Protect mental capital and stop trading for today.`}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-2">
        {/* Pre-Market */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pre-Market Gameplan</h3>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Directional Bias</label>
            <textarea
              rows={2}
              value={bias}
              onChange={(e) => setBias(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Key Levels</label>
            <textarea
              rows={2}
              value={levels}
              onChange={(e) => setLevels(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Scheduled News / Catalysts</label>
            <input
              type="text"
              value={news}
              onChange={(e) => setNews(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">A+ Setups to Stalk</label>
            <input
              type="text"
              value={aPlusSetups}
              onChange={(e) => setAPlusSetups(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Trades</label>
              <input
                type="number"
                value={maxTrades}
                onChange={(e) => setMaxTrades(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Daily Loss ({cur})</label>
              <input
                type="number"
                value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Daily Process Goal</label>
            <input
              type="text"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* End of Day Review + Linked Trades */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">End-of-Day Review</h3>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Followed the Plan? (1–5)</label>
              <div className="flex gap-2">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEodFollowedPlan(n)}
                    className={`h-9 w-10 rounded-lg font-mono text-sm font-semibold ${
                      eodFollowedPlan === n
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Best Decision</label>
              <textarea
                rows={2}
                value={bestDecision}
                onChange={(e) => setBestDecision(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Worst Decision</label>
              <textarea
                rows={2}
                value={worstDecision}
                onChange={(e) => setWorstDecision(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Emotion Summary</label>
              <input
                type="text"
                value={emotionSummary}
                onChange={(e) => setEmotionSummary(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save Daily Plan
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Linked Trades ({dayTrades.length})
            </h3>
            {dayTrades.length === 0 ? (
              <p className="text-xs text-slate-500">No trades taken on {dateKey}.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {dayTrades.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDrawerTradeId(t.id)}
                    className="flex w-full items-center justify-between py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded"
                  >
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {t.instrument} · {t.direction}
                    </span>
                    <span className="font-mono tabular-nums">
                      <span className={t.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {formatCurrency(t.netPnl, accountsMap.get(t.accountId)?.currency || 'USD', { signed: true })}
                      </span>{' '}
                      <span className="text-slate-500">({formatR(t.actualR)})</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Per-Pair Before / After Charts & Notes */}
        <div className="lg:col-span-2 space-y-3">
          <PairPlansSection
            mode="daily"
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
              Save Daily Plan & Pair Charts
            </button>
          </div>
        </div>
      </form>

      {/* Saved Daily Plan Records */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Saved Daily Plan Records ({savedHistory.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">Click any day to review before/after charts and EOD lessons</span>
        </div>

        {savedHistory.length === 0 ? (
          <p className="py-4 text-xs text-slate-500">
            No daily plans saved yet. Log your pre-market gameplan and pair charts above, then click Save Daily Plan.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {savedHistory.map(({ plan, pnl, tradeCount, pairs, preShots, afterShots }) => {
              const isCurrent = plan.dateKey === dateKey;
              const pairList = pairs.map((p) => p.instrument).join(', ');
              return (
                <button
                  key={plan.dateKey}
                  type="button"
                  onClick={() => setDateKey(plan.dateKey)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left transition-colors rounded-lg ${
                    isCurrent
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {plan.dateKey}
                      </span>
                      {isCurrent && (
                        <span className="font-medium text-blue-600 dark:text-blue-400">· Viewing</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {pairs.length > 0
                        ? `${pairs.length} pairs (${pairList}) · ${preShots} before / ${afterShots} after charts`
                        : plan.bias || plan.aPlusSetups || 'No pair charts attached yet'}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right font-mono text-xs tabular-nums shrink-0">
                    <span className="text-slate-500">{tradeCount} trades</span>
                    <span className="text-slate-600 dark:text-slate-300">Plan {plan.eodFollowedPlan}/5</span>
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
