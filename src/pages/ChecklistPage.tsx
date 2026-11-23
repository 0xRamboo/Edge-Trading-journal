import React, { useMemo, useState } from 'react';
import { CheckSquare, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useJournal } from '../context/JournalContext';
import { ChecklistRule } from '../types/trading';
import { getTradePnlInDisplayCurrency } from '../utils/calculations';
import { formatCurrency } from '../utils/currency';

export function ChecklistPage() {
  const {
    checklistRules,
    filteredLiveTrades,
    accounts,
    settings,
    saveChecklistRule,
    deleteChecklistRule,
    updateSettings,
    pushToast,
  } = useJournal();

  const [newPhase, setNewPhase] = useState<ChecklistRule['phase']>('pre');
  const [newText, setNewText] = useState('');
  const [newRequired, setNewRequired] = useState(true);

  const [maxRiskPct, setMaxRiskPct] = useState(String(settings.hardRiskRules.maxRiskPerTradePct));
  const [maxDailyLoss, setMaxDailyLoss] = useState(String(settings.hardRiskRules.maxDailyLoss));
  const [maxTradesDay, setMaxTradesDay] = useState(String(settings.hardRiskRules.maxTradesPerDay));

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cur = settings.displayCurrency;

  const stats = useMemo(() => {
    const withChecklist = filteredLiveTrades.filter((t) => t.checklistResult && t.checklistResult.total > 0);
    const fullFollowed = withChecklist.filter((t) => t.checklistResult.completed >= t.checklistResult.total);
    const notFollowed = withChecklist.filter((t) => t.checklistResult.completed < t.checklistResult.total);

    const sumPnl = (arr: typeof withChecklist) =>
      arr.reduce((s, t) => s + getTradePnlInDisplayCurrency(t, accountsMap, cur), 0);
    const winRate = (arr: typeof withChecklist) =>
      arr.length > 0 ? (arr.filter((t) => t.netPnl > 0).length / arr.length) * 100 : 0;

    // Most-broken rules (only counting trades that logged checklist items and missed specific active rules)
    const missCounts = new Map<string, number>();
    for (const r of checklistRules.filter((x) => x.phase === 'pre' && x.active)) {
      let misses = 0;
      for (const t of withChecklist) {
        if (!t.checklistResult.checkedRuleIds.includes(r.id)) misses += 1;
      }
      if (misses > 0) missCounts.set(r.text, misses);
    }

    return {
      complianceRate: withChecklist.length > 0 ? (fullFollowed.length / withChecklist.length) * 100 : 100,
      fullCount: fullFollowed.length,
      fullPnl: sumPnl(fullFollowed),
      fullWr: winRate(fullFollowed),
      notCount: notFollowed.length,
      notPnl: sumPnl(notFollowed),
      notWr: winRate(notFollowed),
      mostBroken: Array.from(missCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [filteredLiveTrades, checklistRules, accountsMap, cur]);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    await saveChecklistRule({
      id: `rule-${Date.now()}`,
      phase: newPhase,
      text: newText.trim(),
      required: newRequired,
      order: checklistRules.length + 1,
      active: true,
    });
    setNewText('');
    pushToast('success', 'Added checklist rule.');
  };

  const handleSaveHardRules = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      hardRiskRules: {
        maxRiskPerTradePct: parseFloat(maxRiskPct) || 1.5,
        maxDailyLoss: parseFloat(maxDailyLoss) || 1000,
        maxTradesPerDay: parseInt(maxTradesDay, 10) || 4,
      },
    });
    pushToast('success', 'Updated hard risk guardrails.');
  };

  return (
    <div className="space-y-6">
      {/* Compliance Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Full Checklist Compliance Rate</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.complianceRate.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.fullCount} full · {stats.notCount} incomplete
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">P&L When Checklist Fully Followed</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              stats.fullPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatCurrency(stats.fullPnl, cur, { signed: true })}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500">WR {stats.fullWr.toFixed(1)}%</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">P&L When Checklist Skipped</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              stats.notPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatCurrency(stats.notPnl, cur, { signed: true })}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500">WR {stats.notWr.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Rules Editor */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CheckSquare className="h-4 w-4 text-blue-500" />
              Trading Checklist Rules
            </h3>
          </div>

          <form onSubmit={handleAddRule} className="flex flex-wrap gap-2">
            <select
              value={newPhase}
              onChange={(e) => setNewPhase(e.target.value as ChecklistRule['phase'])}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            >
              <option value="pre">Pre-Trade</option>
              <option value="during">During Trade</option>
              <option value="post">Post-Trade</option>
            </select>
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Add custom rule..."
              className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
              required
            />
            <label className="flex items-center gap-1.5 px-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
              />
              Required
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>

          {(['pre', 'during', 'post'] as const).map((phase) => {
            const group = checklistRules.filter((r) => r.phase === phase);
            const title = phase === 'pre' ? 'Pre-Trade' : phase === 'during' ? 'During Trade' : 'Post-Trade';
            return (
              <div key={phase} className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {group.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.active}
                          onChange={() => void saveChecklistRule({ ...rule, active: !rule.active })}
                        />
                        <span className={rule.active ? 'text-slate-900 dark:text-slate-100' : 'line-through text-slate-400'}>
                          {rule.text}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => void saveChecklistRule({ ...rule, required: !rule.required })}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          rule.required ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
                        }`}
                      >
                        {rule.required ? 'Required' : 'Optional'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteChecklistRule(rule.id)}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hard Risk Rules & Most Broken */}
        <div className="space-y-6 lg:col-span-4">
          <form
            onSubmit={handleSaveHardRules}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Hard Risk Guardrails
            </h3>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Risk Per Trade (%)</label>
              <input
                type="number"
                step="0.1"
                value={maxRiskPct}
                onChange={(e) => setMaxRiskPct(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Daily Loss ({cur})</label>
              <input
                type="number"
                step="any"
                value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Trades Per Day</label>
              <input
                type="number"
                value={maxTradesDay}
                onChange={(e) => setMaxTradesDay(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Save Risk Limits
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Most-Broken Rules</h3>
            {stats.mostBroken.length === 0 ? (
              <p className="text-xs text-slate-500">No missed rules recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {stats.mostBroken.map(([ruleText, count]) => (
                  <div key={ruleText} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-slate-700 dark:text-slate-300">{ruleText}</span>
                    <span className="font-mono font-semibold text-red-600 dark:text-red-400 shrink-0">
                      {count}×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
