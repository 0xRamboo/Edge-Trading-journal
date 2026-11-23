import React, { useMemo, useState } from 'react';
import { AlertTriangle, Brain, Loader2, Printer, Send, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useJournal } from '../context/JournalContext';
import { AiProviderPreference, AiReport } from '../types/trading';
import {
  buildJournalContextForAi,
  calculatePerformance,
  detectPatternAlerts,
} from '../utils/calculations';
import { convertCurrency, formatCurrency } from '../utils/currency';
import { getDateKeyInTimezone, getTodayKeyInTimezone, shiftDateKey } from '../utils/timezone';

export function AiAnalyserPage() {
  const {
    accounts,
    strategies,
    checklistRules,
    liveTrades,
    aiReports,
    settings,
    updateSettings,
    saveAiReport,
    deleteAiReport,
    pushToast,
  } = useJournal();

  const today = getTodayKeyInTimezone(settings.timezone);
  const [periodType, setPeriodType] = useState<AiReport['periodType']>('monthly');
  const [accountId, setAccountId] = useState<string>('ALL');
  const [customStart, setCustomStart] = useState(shiftDateKey(today, -29));
  const [customEnd, setCustomEnd] = useState(today);
  const [generating, setGenerating] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string>(aiReports[0]?.id ?? '');
  const [compareReportId, setCompareReportId] = useState<string>('');

  // Chat state
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cur = settings.displayCurrency;

  const patternAlerts = useMemo(
    () => detectPatternAlerts(liveTrades, accountsMap, cur, settings.timezone),
    [liveTrades, accountsMap, cur, settings.timezone]
  );

  const activeReport = useMemo(
    () => aiReports.find((r) => r.id === selectedReportId) ?? aiReports[0] ?? null,
    [aiReports, selectedReportId]
  );
  const compareReport = useMemo(
    () => aiReports.find((r) => r.id === compareReportId) ?? null,
    [aiReports, compareReportId]
  );

  const getPeriodBounds = (): { start: string; end: string; prevStart: string; prevEnd: string } => {
    if (periodType === 'daily') {
      return { start: today, end: today, prevStart: shiftDateKey(today, -1), prevEnd: shiftDateKey(today, -1) };
    }
    if (periodType === 'weekly') {
      return {
        start: shiftDateKey(today, -6),
        end: today,
        prevStart: shiftDateKey(today, -13),
        prevEnd: shiftDateKey(today, -7),
      };
    }
    if (periodType === 'monthly') {
      return {
        start: shiftDateKey(today, -29),
        end: today,
        prevStart: shiftDateKey(today, -59),
        prevEnd: shiftDateKey(today, -30),
      };
    }
    if (periodType === 'yearly') {
      return {
        start: shiftDateKey(today, -364),
        end: today,
        prevStart: shiftDateKey(today, -729),
        prevEnd: shiftDateKey(today, -365),
      };
    }
    return {
      start: customStart,
      end: customEnd,
      prevStart: shiftDateKey(customStart, -30),
      prevEnd: shiftDateKey(customStart, -1),
    };
  };

  const handleGenerateReport = async () => {
    const { start, end, prevStart, prevEnd } = getPeriodBounds();
    const scopeTrades = liveTrades.filter((t) => {
      if (accountId !== 'ALL' && t.accountId !== accountId) return false;
      const dk = getDateKeyInTimezone(t.openTime, settings.timezone);
      return dk >= start && dk <= end;
    });
    if (scopeTrades.length === 0) {
      pushToast('error', 'No trades found in the selected period and account.');
      return;
    }

    const prevTrades = liveTrades.filter((t) => {
      if (accountId !== 'ALL' && t.accountId !== accountId) return false;
      const dk = getDateKeyInTimezone(t.openTime, settings.timezone);
      return dk >= prevStart && dk <= prevEnd;
    });

    const startBal =
      accountId !== 'ALL'
        ? convertCurrency(accountsMap.get(accountId)?.startingBalance ?? 10000, accountsMap.get(accountId)?.currency ?? 'USD', cur)
        : accounts.reduce((s, a) => s + convertCurrency(a.startingBalance, a.currency, cur), 0) || 10000;

    const currentSnapshot = buildJournalContextForAi(
      scopeTrades,
      accounts,
      strategies,
      checklistRules,
      settings.hardRiskRules,
      cur,
      settings.timezone
    );

    const prevStats =
      prevTrades.length > 0
        ? calculatePerformance(prevTrades, startBal, accountsMap, cur, settings.timezone).metrics
        : null;

    const accLabel = accountId === 'ALL' ? 'All Accounts' : accountsMap.get(accountId)?.name ?? 'Account';

    setGenerating(true);
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodLabel: `${periodType.toUpperCase()} (${start} to ${end})`,
          accountLabel: accLabel,
          currentStats: currentSnapshot.metrics,
          previousStats: prevStats,
          breakdowns: {
            disciplineScore: currentSnapshot.disciplineScore,
            disciplineReasons: currentSnapshot.disciplineReasons,
            bySetup: currentSnapshot.bySetup,
            bySession: currentSnapshot.bySession,
            byWeekday: currentSnapshot.byWeekday,
            byHour: currentSnapshot.byHour,
            mistakeCosts: currentSnapshot.mistakeCosts,
            rulesFollowedStats: currentSnapshot.rulesFollowedStats,
          },
          provider: settings.aiProvider ?? 'auto',
          openRouterModel: settings.openRouterModel,
          groqModel: settings.groqModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI report');

      const rawContent = (data.report && typeof data.report === 'object' ? data.report : {}) as Partial<AiReport['content']>;
      const normalizedContent: AiReport['content'] = {
        executiveSummary: typeof rawContent.executiveSummary === 'string' ? rawContent.executiveSummary : '',
        strengths: Array.isArray(rawContent.strengths) ? rawContent.strengths : [],
        weaknesses: Array.isArray(rawContent.weaknesses) ? rawContent.weaknesses : [],
        behavioralPatterns: Array.isArray(rawContent.behavioralPatterns) ? rawContent.behavioralPatterns : [],
        bestAndWorst: typeof rawContent.bestAndWorst === 'string' ? rawContent.bestAndWorst : '',
        ruleComplianceAnalysis: typeof rawContent.ruleComplianceAnalysis === 'string' ? rawContent.ruleComplianceAnalysis : '',
        periodComparison: typeof rawContent.periodComparison === 'string' ? rawContent.periodComparison : '',
        actionItems: Array.isArray(rawContent.actionItems) ? rawContent.actionItems.slice(0, 3) : [],
      };

      const report: AiReport = {
        id: `rep-${Date.now()}`,
        periodType,
        startDate: start,
        endDate: end,
        accountId,
        accountLabel: accLabel,
        createdAt: new Date().toISOString(),
        statsSnapshot: {
          trades: currentSnapshot.metrics.closedTrades,
          netPnl: formatCurrency(currentSnapshot.metrics.netPnl, cur, { signed: true }),
          winRate: `${currentSnapshot.metrics.winRate.toFixed(1)}%`,
          profitFactor: Number.isFinite(currentSnapshot.metrics.profitFactor)
            ? currentSnapshot.metrics.profitFactor.toFixed(2)
            : '∞',
          disciplineScore: currentSnapshot.disciplineScore,
        },
        content: normalizedContent,
      };
      await saveAiReport(report);
      setSelectedReportId(report.id);
      pushToast('success', 'AI performance report generated and saved.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    if (liveTrades.length === 0) {
      pushToast('error', 'Add trades or load demo data before querying your journal.');
      return;
    }

    const nextHist = [...chatHistory, { role: 'user' as const, text: q }];
    setChatHistory(nextHist);
    setQuestion('');
    setChatLoading(true);
    try {
      const snapshot = buildJournalContextForAi(
        liveTrades,
        accounts,
        strategies,
        checklistRules,
        settings.hardRiskRules,
        cur,
        settings.timezone
      );
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: chatHistory,
          journalSnapshot: snapshot,
          provider: settings.aiProvider ?? 'auto',
          openRouterModel: settings.openRouterModel,
          groqModel: settings.groqModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat request failed');
      setChatHistory([...nextHist, { role: 'model', text: data.answer }]);
    } catch (err) {
      setChatHistory([
        ...nextHist,
        { role: 'model', text: err instanceof Error ? err.message : 'Error querying AI analyst.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (liveTrades.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="No journal data to analyse yet"
        description="Log trades or load the 150-trade demo dataset to generate quantitative AI audits, pattern alerts, and ask questions about your edge."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Pattern Alerts */}
      {patternAlerts.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 no-print">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active Behavioural Alerts</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {patternAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 text-xs">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === 'danger' ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{a.title}</div>
                  <div className="text-slate-600 dark:text-slate-400">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report Generator Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-end gap-3 no-print">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Period</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as AiReport['periodType'])}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {periodType === 'custom' && (
          <>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Start</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">End</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-xs"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-slate-500 mb-1">Account Scope</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="ALL">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">AI Provider</label>
          <select
            value={settings.aiProvider ?? 'auto'}
            onChange={(e) => void updateSettings({ aiProvider: e.target.value as AiProviderPreference })}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="auto">Auto (Gemini · OpenRouter · Groq)</option>
            <option value="gemini">Google Gemini</option>
            <option value="openrouter">OpenRouter</option>
            <option value="groq">Groq</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleGenerateReport()}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          Generate AI Audit Report
        </button>

        {activeReport && (
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
        )}
      </div>

      {/* Main Split: Saved Reports + Report View & Chat */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Report Content */}
        <div className="space-y-4 lg:col-span-8">
          {aiReports.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Saved Report:</span>
                <select
                  value={activeReport?.id ?? ''}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  {aiReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.periodType.toUpperCase()} · {r.startDate} → {r.endDate} ({r.accountLabel})
                    </option>
                  ))}
                </select>
                {activeReport && (
                  <button
                    type="button"
                    onClick={() => void deleteAiReport(activeReport.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500"
                    title="Delete Report"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {aiReports.length >= 2 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Compare with:</span>
                  <select
                    value={compareReportId}
                    onChange={(e) => setCompareReportId(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                  >
                    <option value="">None</option>
                    {aiReports
                      .filter((r) => r.id !== activeReport?.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.periodType.toUpperCase()} · {r.startDate} → {r.endDate}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {activeReport ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="text-xs font-mono text-slate-500">
                  {activeReport.periodType.toUpperCase()} AUDIT · {activeReport.startDate} → {activeReport.endDate} ·{' '}
                  {activeReport.accountLabel}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs tabular-nums">
                  <span>Trades: {activeReport.statsSnapshot?.trades ?? 0}</span>
                  <span>Net P&L: {activeReport.statsSnapshot?.netPnl ?? '—'}</span>
                  <span>WR: {activeReport.statsSnapshot?.winRate ?? '—'}</span>
                  <span>PF: {activeReport.statsSnapshot?.profitFactor ?? '—'}</span>
                  <span>Discipline: {activeReport.statsSnapshot?.disciplineScore ?? 0}/100</span>
                </div>
              </div>

              {compareReport && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono">
                  <div className="font-sans font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Comparison vs {compareReport.startDate} → {compareReport.endDate}
                  </div>
                  <div className="flex flex-wrap gap-4 text-slate-600 dark:text-slate-400">
                    <span>Prev Net: {compareReport.statsSnapshot?.netPnl ?? '—'}</span>
                    <span>Prev WR: {compareReport.statsSnapshot?.winRate ?? '—'}</span>
                    <span>Prev PF: {compareReport.statsSnapshot?.profitFactor ?? '—'}</span>
                    <span>Prev Discipline: {compareReport.statsSnapshot?.disciplineScore ?? 0}/100</span>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Executive Summary</h4>
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {activeReport.content?.executiveSummary || 'No summary returned.'}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">Strengths</h4>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {(activeReport.content?.strengths ?? []).map((s, i) => (
                      <li key={i}>· {s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5">Weaknesses</h4>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {(activeReport.content?.weaknesses ?? []).map((w, i) => (
                      <li key={i}>· {w}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Behavioral Patterns
                </h4>
                <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  {(activeReport.content?.behavioralPatterns ?? []).map((b, i) => (
                    <li key={i}>· {b}</li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Best & Worst Setups/Sessions</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {activeReport.content?.bestAndWorst || '—'}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Rule Compliance & Period Delta</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {activeReport.content?.ruleComplianceAnalysis || ''} {activeReport.content?.periodComparison || ''}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  3 Action Items for Next Period
                </h4>
                <ol className="space-y-1.5 text-sm text-slate-800 dark:text-slate-200">
                  {(activeReport.content?.actionItems ?? []).slice(0, 3).map((item, idx) => (
                    <li key={idx} className="font-medium">
                      {idx + 1}. {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
              Select a period and click "Generate AI Audit Report" to produce your data-driven performance review.
            </div>
          )}
        </div>

        {/* Journal AI Chat Box */}
        <div className="flex h-[540px] flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 lg:col-span-4 no-print">
          <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ask Your Journal Data</h3>
            <p className="text-[11px] text-slate-500">
              e.g. "Why do I lose on Fridays?" or "Which session has my highest R?"
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            {chatHistory.length === 0 && (
              <div className="space-y-2 text-slate-500">
                <p>Ask any question grounded in your logged trades:</p>
                {[
                  'Why do I lose on Fridays?',
                  'How much did my mistake tags cost me?',
                  'Which strategy + session combination is strongest?',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuestion(q)}
                    className="block w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {chatHistory.map((m, idx) => (
              <div
                key={idx}
                className={`rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-6 bg-blue-600 text-white'
                    : 'mr-6 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                }`}
              >
                {m.text}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing journal...
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-2 border-t border-slate-200 dark:border-slate-800 p-3">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your performance..."
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
