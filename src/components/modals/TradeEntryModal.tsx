import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Plus, Trash2, Upload, X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import {
  EMOTION_TAGS,
  MARKET_CONDITIONS,
  MISTAKE_TAGS,
  MarketType,
  PartialClose,
  Trade,
  TradeDirection,
  TradeScreenshot,
  TradeStatus,
  TradingSession,
} from '../../types/trading';
import { computeRiskAndR, computeTradeGrossPnl } from '../../utils/calculations';
import { formatCurrency, formatR } from '../../utils/currency';
import { localDateTimeToUtcIso, utcIsoToLocalInput } from '../../utils/timezone';

export function TradeEntryModal() {
  const {
    accounts,
    strategies,
    checklistRules,
    settings,
    tradeModalState,
    closeTradeModal,
    saveTrade,
    saveAccount,
    pushToast,
    selectedAccountId,
  } = useJournal();

  const { open, editTrade, backtestSessionId } = tradeModalState;

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const preRules = useMemo(
    () => checklistRules.filter((r) => r.active && r.phase === 'pre'),
    [checklistRules]
  );

  // Form states
  const [accountId, setAccountId] = useState('');
  const [market, setMarket] = useState<MarketType>('forex');
  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<TradeDirection>('LONG');
  const [status, setStatus] = useState<TradeStatus>('CLOSED');
  const [openTimeLocal, setOpenTimeLocal] = useState('');
  const [closeTimeLocal, setCloseTimeLocal] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [size, setSize] = useState('1');
  const [multiplier, setMultiplier] = useState('1');
  const [explicitRiskAmount, setExplicitRiskAmount] = useState('');
  const [fees, setFees] = useState('0');
  const [commission, setCommission] = useState('0');
  const [swap, setSwap] = useState('0');
  const [manualNetPnl, setManualNetPnl] = useState('');
  const [useAutoPnl, setUseAutoPnl] = useState(true);
  const [mae, setMae] = useState('');
  const [mfe, setMfe] = useState('');
  const [setup, setSetup] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [session, setSession] = useState<TradingSession>('London');
  const [marketCondition, setMarketCondition] = useState<string>(MARKET_CONDITIONS[0]);
  const [rulesFollowed, setRulesFollowed] = useState(true);
  const [checkedRuleIds, setCheckedRuleIds] = useState<string[]>([]);
  const [emotionBeforeScore, setEmotionBeforeScore] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [emotionBeforeTag, setEmotionBeforeTag] = useState('Focused');
  const [emotionDuringScore, setEmotionDuringScore] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [emotionDuringTag, setEmotionDuringTag] = useState('Calm');
  const [emotionAfterScore, setEmotionAfterScore] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [emotionAfterTag, setEmotionAfterTag] = useState('Calm');
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [screenshots, setScreenshots] = useState<TradeScreenshot[]>([]);
  const [partialCloses, setPartialCloses] = useState<PartialClose[]>([]);

  // Initialize form whenever modal opens
  useEffect(() => {
    if (!open) return;
    if (editTrade) {
      setAccountId(editTrade.accountId);
      setMarket(editTrade.market);
      setInstrument(editTrade.instrument);
      setDirection(editTrade.direction);
      setStatus(editTrade.status);
      setOpenTimeLocal(utcIsoToLocalInput(editTrade.openTime, settings.timezone));
      setCloseTimeLocal(editTrade.closeTime ? utcIsoToLocalInput(editTrade.closeTime, settings.timezone) : '');
      setEntryPrice(String(editTrade.entryPrice));
      setExitPrice(editTrade.exitPrice !== null ? String(editTrade.exitPrice) : '');
      setStopLoss(editTrade.stopLoss !== null ? String(editTrade.stopLoss) : '');
      setTakeProfit(editTrade.takeProfit !== null ? String(editTrade.takeProfit) : '');
      setSize(String(editTrade.size));
      setMultiplier(String(editTrade.contractMultiplier ?? 1));
      setExplicitRiskAmount(editTrade.initialRiskAmount !== null ? String(editTrade.initialRiskAmount) : '');
      setFees(String(editTrade.fees));
      setCommission(String(editTrade.commission));
      setSwap(String(editTrade.swap));
      setManualNetPnl(String(editTrade.netPnl));
      setUseAutoPnl(false);
      setMae(editTrade.mae !== null ? String(editTrade.mae) : '');
      setMfe(editTrade.mfe !== null ? String(editTrade.mfe) : '');
      setSetup(editTrade.setup);
      setStrategyId(editTrade.strategyId);
      setSession(editTrade.session);
      setMarketCondition(editTrade.marketCondition || MARKET_CONDITIONS[0]);
      setRulesFollowed(editTrade.rulesFollowed);
      setCheckedRuleIds(editTrade.checklistResult?.checkedRuleIds ?? []);
      setEmotionBeforeScore(editTrade.emotionBefore.score);
      setEmotionBeforeTag(editTrade.emotionBefore.tag);
      setEmotionDuringScore(editTrade.emotionDuring.score);
      setEmotionDuringTag(editTrade.emotionDuring.tag);
      setEmotionAfterScore(editTrade.emotionAfter.score);
      setEmotionAfterTag(editTrade.emotionAfter.tag);
      setMistakeTags(editTrade.mistakeTags);
      setCustomTags(editTrade.customTags);
      setNotes(editTrade.notes);
      setScreenshots(editTrade.screenshots);
      setPartialCloses(editTrade.partialCloses ?? []);
    } else {
      const nowLocal = utcIsoToLocalInput(new Date().toISOString(), settings.timezone);
      const defaultAcc =
        selectedAccountId !== 'ALL'
          ? selectedAccountId
          : activeAccounts[0]?.id ?? '';
      setAccountId(defaultAcc);
      setMarket('forex');
      setInstrument('EURUSD');
      setDirection('LONG');
      setStatus('CLOSED');
      setOpenTimeLocal(nowLocal);
      setCloseTimeLocal(nowLocal);
      setEntryPrice('');
      setExitPrice('');
      setStopLoss('');
      setTakeProfit('');
      setSize('1');
      setMultiplier('100000');
      setExplicitRiskAmount('');
      setFees('0');
      setCommission('0');
      setSwap('0');
      setManualNetPnl('');
      setUseAutoPnl(true);
      setMae('');
      setMfe('');
      setSetup('');
      setStrategyId(strategies[0]?.id ?? '');
      setSession('London');
      setMarketCondition(MARKET_CONDITIONS[0]);
      setRulesFollowed(true);
      setCheckedRuleIds([]);
      setEmotionBeforeScore(4);
      setEmotionBeforeTag('Focused');
      setEmotionDuringScore(4);
      setEmotionDuringTag('Calm');
      setEmotionAfterScore(4);
      setEmotionAfterTag('Calm');
      setMistakeTags([]);
      setCustomTags([]);
      setNotes('');
      setScreenshots([]);
      setPartialCloses([]);
    }
  }, [open, editTrade, settings.timezone, selectedAccountId, activeAccounts, strategies]);

  // Adjust default contract multiplier when switching market on new trade
  const handleMarketChange = (m: MarketType) => {
    setMarket(m);
    if (!editTrade) {
      if (m === 'forex') setMultiplier('100000');
      else setMultiplier('1');
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);

  const previewCalc = useMemo(() => {
    const ep = parseFloat(entryPrice);
    const xp = exitPrice ? parseFloat(exitPrice) : null;
    const sl = stopLoss ? parseFloat(stopLoss) : null;
    const tp = takeProfit ? parseFloat(takeProfit) : null;
    const sz = parseFloat(size) || 0;
    const mult = parseFloat(multiplier) || 1;
    const totalFee = (parseFloat(fees) || 0) + (parseFloat(commission) || 0) + (parseFloat(swap) || 0);

    const gross =
      status === 'OPEN'
        ? 0
        : Number.isFinite(ep)
        ? computeTradeGrossPnl({
            direction,
            entryPrice: ep,
            exitPrice: xp,
            size: sz,
            contractMultiplier: mult,
            partialCloses,
          })
        : 0;

    const net =
      status === 'OPEN'
        ? 0
        : useAutoPnl
        ? gross - totalFee
        : parseFloat(manualNetPnl) || 0;

    const expRisk = explicitRiskAmount ? parseFloat(explicitRiskAmount) : null;
    const risk = computeRiskAndR({
      entryPrice: Number.isFinite(ep) ? ep : 0,
      stopLoss: sl,
      takeProfit: tp,
      size: sz,
      contractMultiplier: mult,
      netPnl: net,
      explicitRiskAmount: expRisk,
    });

    const riskPct =
      risk.initialRiskAmount && selectedAccount && selectedAccount.startingBalance > 0
        ? (risk.initialRiskAmount / selectedAccount.startingBalance) * 100
        : null;

    return { gross, net, ...risk, riskPct };
  }, [
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    size,
    multiplier,
    fees,
    commission,
    swap,
    status,
    direction,
    partialCloses,
    useAutoPnl,
    manualNetPnl,
    explicitRiskAmount,
    selectedAccount,
  ]);

  if (!open) return null;

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>, stage: TradeScreenshot['stage']) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (screenshots.length >= 3) {
      pushToast('error', 'Maximum 3 screenshots allowed per trade.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScreenshots((prev) => [
          ...prev.filter((s) => s.stage !== stage),
          { id: `ss-${Date.now()}`, stage, dataUrl: reader.result as string },
        ]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleMistake = (tag: string) => {
    setMistakeTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addCustomTag = () => {
    const clean = customTagInput.trim();
    if (!clean) return;
    if (!customTags.includes(clean)) setCustomTags((prev) => [...prev, clean]);
    setCustomTagInput('');
  };

  const addPartialClose = () => {
    const ep = parseFloat(entryPrice) || 0;
    const pPrice = ep;
    setPartialCloses((prev) => [
      ...prev,
      {
        id: `pc-${Date.now()}`,
        price: pPrice,
        size: (parseFloat(size) || 1) / 2,
        time: new Date().toISOString(),
        pnl: 0,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let targetAccountId = accountId;

    // Auto-create a default account if none exist yet so user is never blocked
    if (!targetAccountId) {
      const autoAcc = {
        id: `acc-${Date.now()}`,
        name: 'Primary Trading Account',
        broker: 'Manual Journal',
        type: 'live' as const,
        startingBalance: 10000,
        currency: settings.displayCurrency || 'USD',
        commissionModel: 'zero' as const,
        commissionRate: 0,
        archived: false,
        createdAt: new Date().toISOString(),
      };
      await saveAccount(autoAcc);
      targetAccountId = autoAcc.id;
    }

    const ep = parseFloat(entryPrice);
    const sz = parseFloat(size);
    if (!instrument.trim() || !Number.isFinite(ep) || ep <= 0 || !Number.isFinite(sz) || sz <= 0) {
      pushToast('error', 'Instrument, valid Entry Price, and Position Size (> 0) are required.');
      return;
    }

    const openIso = localDateTimeToUtcIso(openTimeLocal, settings.timezone);
    const closeIso = status === 'OPEN' || !closeTimeLocal ? '' : localDateTimeToUtcIso(closeTimeLocal, settings.timezone);
    const holdMinutes =
      closeIso && openIso
        ? Math.max(0, Math.round((new Date(closeIso).getTime() - new Date(openIso).getTime()) / 60000))
        : 0;

    const reqPre = preRules.filter((r) => r.required);
    const requiredPassed = reqPre.every((r) => checkedRuleIds.includes(r.id));

    const trade: Trade = {
      id: editTrade ? editTrade.id : `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      accountId: targetAccountId,
      market,
      instrument: instrument.trim().toUpperCase(),
      direction,
      status,
      openTime: openIso,
      closeTime: closeIso,
      entryPrice: ep,
      exitPrice: exitPrice ? parseFloat(exitPrice) : null,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
      size: sz,
      contractMultiplier: parseFloat(multiplier) || 1,
      initialRiskAmount: previewCalc.initialRiskAmount,
      initialRiskPct: previewCalc.riskPct !== null ? Number(previewCalc.riskPct.toFixed(2)) : null,
      fees: parseFloat(fees) || 0,
      commission: parseFloat(commission) || 0,
      swap: parseFloat(swap) || 0,
      grossPnl: Number((useAutoPnl ? previewCalc.gross : previewCalc.net + (parseFloat(fees) || 0) + (parseFloat(commission) || 0) + (parseFloat(swap) || 0)).toFixed(2)),
      netPnl: Number(previewCalc.net.toFixed(2)),
      plannedRR: previewCalc.plannedRR !== null ? Number(previewCalc.plannedRR.toFixed(2)) : null,
      actualR: previewCalc.actualR !== null ? Number(previewCalc.actualR.toFixed(2)) : null,
      mae: mae ? Math.abs(parseFloat(mae)) : null,
      mfe: mfe ? Math.abs(parseFloat(mfe)) : null,
      holdingTimeMinutes: holdMinutes,
      setup: setup.trim(),
      strategyId,
      session,
      emotionBefore: { score: emotionBeforeScore, tag: emotionBeforeTag },
      emotionDuring: { score: emotionDuringScore, tag: emotionDuringTag },
      emotionAfter: { score: emotionAfterScore, tag: emotionAfterTag },
      mistakeTags,
      customTags,
      rulesFollowed,
      checklistResult: {
        total: preRules.length,
        completed: checkedRuleIds.length,
        requiredPassed,
        checkedRuleIds,
      },
      notes: notes.trim(),
      screenshots,
      partialCloses: partialCloses.length > 0 ? partialCloses : undefined,
      isBacktest: editTrade?.isBacktest ?? Boolean(backtestSessionId),
      backtestSessionId: editTrade?.backtestSessionId ?? (backtestSessionId || undefined),
      marketCondition,
      aiReview: editTrade?.aiReview,
      createdAt: editTrade ? editTrade.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveTrade(trade);
    pushToast('success', editTrade ? `Updated ${trade.instrument} trade.` : `Saved ${trade.instrument} trade.`);
    closeTradeModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editTrade ? `Edit Trade · ${editTrade.instrument}` : backtestSessionId ? 'Log Backtest Trade' : 'Log Trade'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Timezone: {settings.timezone} · Auto-calculates P&L, Planned R:R, and Actual R-multiple
            </p>
          </div>
          <button
            type="button"
            onClick={closeTradeModal}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Live Calculation Banner */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Net P&L</div>
              <div
                className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                  previewCalc.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatCurrency(previewCalc.net, selectedAccount?.currency || settings.displayCurrency, { signed: true })}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Actual R</div>
              <div
                className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                  (previewCalc.actualR ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatR(previewCalc.actualR)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Initial Risk</div>
              <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {previewCalc.initialRiskAmount !== null
                  ? `${formatCurrency(previewCalc.initialRiskAmount, selectedAccount?.currency || 'USD')}${
                      previewCalc.riskPct !== null ? ` (${previewCalc.riskPct.toFixed(2)}%)` : ''
                    }`
                  : 'No SL'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Planned R:R</div>
              <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {previewCalc.plannedRR !== null ? `1 : ${previewCalc.plannedRR.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>

          {/* Core Execution Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {activeAccounts.length === 0 && <option value="">Default Account (Auto)</option>}
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Market</label>
              <select
                value={market}
                onChange={(e) => handleMarketChange(e.target.value as MarketType)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="forex">Forex</option>
                <option value="crypto">Crypto</option>
                <option value="stocks">Stocks</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Instrument *</label>
              <input
                type="text"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                placeholder="EURUSD, BTCUSDT, NVDA"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm uppercase text-slate-900 dark:text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Direction & Status</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('LONG')}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    direction === 'LONG'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SHORT')}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    direction === 'SHORT'
                      ? 'bg-red-600 text-white'
                      : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  SHORT
                </button>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TradeStatus)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="CLOSED">Closed</option>
                  <option value="OPEN">Open</option>
                  <option value="PARTIAL">Partial</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dates & Prices */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Open Time *</label>
              <input
                type="datetime-local"
                value={openTimeLocal}
                onChange={(e) => setOpenTimeLocal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Close Time</label>
              <input
                type="datetime-local"
                value={closeTimeLocal}
                disabled={status === 'OPEN'}
                onChange={(e) => setCloseTimeLocal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Entry Price *</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Exit Price</label>
              <input
                type="number"
                step="any"
                value={exitPrice}
                disabled={status === 'OPEN'}
                onChange={(e) => setExitPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stop Loss</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Take Profit</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Sizing, Fees, P&L Override, MAE/MFE */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Size / Lots *</label>
              <input
                type="number"
                step="any"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Contract Mult</label>
              <input
                type="number"
                step="any"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Risk ($) Override</label>
              <input
                type="number"
                step="any"
                value={explicitRiskAmount}
                onChange={(e) => setExplicitRiskAmount(e.target.value)}
                placeholder="Auto from SL"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Fees / Comm / Swap</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="any"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  title="Fees"
                  className="w-1/3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-2 font-mono text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  step="any"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  title="Commission"
                  className="w-1/3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-2 font-mono text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  step="any"
                  value={swap}
                  onChange={(e) => setSwap(e.target.value)}
                  title="Swap"
                  className="w-1/3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-2 font-mono text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">MAE ($)</label>
              <input
                type="number"
                step="any"
                value={mae}
                onChange={(e) => setMae(e.target.value)}
                placeholder="Max drawdown"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">MFE ($)</label>
              <input
                type="number"
                step="any"
                value={mfe}
                onChange={(e) => setMfe(e.target.value)}
                placeholder="Peak profit"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* P&L Manual Override & Partial Closes */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAutoPnl}
                  onChange={(e) => setUseAutoPnl(e.target.checked)}
                />
                Auto-calculate Net P&L from prices
              </label>
              {!useAutoPnl && (
                <input
                  type="number"
                  step="any"
                  value={manualNetPnl}
                  onChange={(e) => setManualNetPnl(e.target.value)}
                  placeholder="Exact Net P&L ($)"
                  className="w-36 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 font-mono text-sm text-slate-900 dark:text-slate-100"
                />
              )}
            </div>
            <button
              type="button"
              onClick={addPartialClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> Add Partial Close
            </button>
          </div>

          {partialCloses.length > 0 && (
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Partial Closes</div>
              {partialCloses.map((pc, idx) => (
                <div key={pc.id} className="grid grid-cols-4 gap-2 items-center">
                  <input
                    type="number"
                    step="any"
                    value={pc.price}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setPartialCloses((prev) => prev.map((p, i) => (i === idx ? { ...p, price: val } : p)));
                    }}
                    placeholder="Price"
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-xs"
                  />
                  <input
                    type="number"
                    step="any"
                    value={pc.size}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setPartialCloses((prev) => prev.map((p, i) => (i === idx ? { ...p, size: val } : p)));
                    }}
                    placeholder="Size"
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-xs"
                  />
                  <input
                    type="number"
                    step="any"
                    value={pc.pnl}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setPartialCloses((prev) => prev.map((p, i) => (i === idx ? { ...p, pnl: val } : p)));
                    }}
                    placeholder="Realized P&L ($)"
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setPartialCloses((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-red-500 hover:underline justify-self-start"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Setup, Strategy, Session, Market Condition */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Strategy Playbook</label>
              <select
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Setup Name</label>
              <input
                type="text"
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                placeholder="e.g. Sweep + FVG"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Session</label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value as TradingSession)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="Asia">Asia</option>
                <option value="London">London</option>
                <option value="Overlap">London / NY Overlap</option>
                <option value="New York">New York</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Market Condition</label>
              <select
                value={marketCondition}
                onChange={(e) => setMarketCondition(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {MARKET_CONDITIONS.map((mc) => (
                  <option key={mc} value={mc}>
                    {mc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pre-Trade Checklist & Discipline */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                  Pre-Trade Checklist ({checkedRuleIds.length}/{preRules.length})
                </h4>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rulesFollowed}
                    onChange={(e) => setRulesFollowed(e.target.checked)}
                  />
                  Rules Followed
                </label>
              </div>
              <div className="space-y-1.5 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                {preRules.length === 0 ? (
                  <p className="text-xs text-slate-500">No active pre-trade rules configured.</p>
                ) : (
                  preRules.map((rule) => {
                    const checked = checkedRuleIds.includes(rule.id);
                    return (
                      <label key={rule.id} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCheckedRuleIds((prev) =>
                              checked ? prev.filter((id) => id !== rule.id) : [...prev, rule.id]
                            )
                          }
                          className="mt-0.5"
                        />
                        <span>
                          {rule.text}
                          {rule.required && <span className="ml-1 text-red-500">*</span>}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Emotion Timeline */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Emotion Log (Before / During / After)
              </h4>
              <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                {[
                  { label: 'Before', score: emotionBeforeScore, setScore: setEmotionBeforeScore, tag: emotionBeforeTag, setTag: setEmotionBeforeTag },
                  { label: 'During', score: emotionDuringScore, setScore: setEmotionDuringScore, tag: emotionDuringTag, setTag: setEmotionDuringTag },
                  { label: 'After', score: emotionAfterScore, setScore: setEmotionAfterScore, tag: emotionAfterTag, setTag: setEmotionAfterTag },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="w-14 text-xs font-medium text-slate-600 dark:text-slate-400">{row.label}</span>
                    <div className="flex items-center gap-1">
                      {([1, 2, 3, 4, 5] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => row.setScore(n)}
                          className={`h-7 w-7 rounded text-xs font-mono font-medium transition-colors ${
                            row.score === n
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <select
                      value={row.tag}
                      onChange={(e) => row.setTag(e.target.value)}
                      className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                    >
                      {EMOTION_TAGS.map((et) => (
                        <option key={et} value={et}>
                          {et}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mistake Tags & Custom Tags */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Mistake Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MISTAKE_TAGS.map((tag) => {
                  const active = mistakeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleMistake(tag)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-red-600 text-white'
                          : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Custom Tags
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                  placeholder="Add tag (e.g. cpi-day)"
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  Add
                </button>
              </div>
              {customTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                  {customTags.map((ct) => (
                    <span key={ct} className="inline-flex items-center gap-1">
                      #{ct}
                      <button
                        type="button"
                        onClick={() => setCustomTags((prev) => prev.filter((x) => x !== ct))}
                        className="text-slate-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes & Screenshots (up to 3) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Execution Notes
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context, HTF narrative, trigger quality, management notes..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Chart Screenshots (Before / Entry / After — max 3)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['before', 'entry', 'after'] as const).map((stage) => {
                  const existing = screenshots.find((s) => s.stage === stage);
                  return (
                    <div
                      key={stage}
                      className="relative flex h-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 overflow-hidden"
                    >
                      {existing ? (
                        <>
                          <img src={existing.dataUrl} alt={`${stage} chart`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setScreenshots((prev) => prev.filter((s) => s.stage !== stage))}
                            className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white hover:bg-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-xs text-slate-500 hover:text-blue-500">
                          <Upload className="h-4 w-4" />
                          <span className="capitalize">{stage}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handleScreenshotUpload(e, stage)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={closeTradeModal}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {editTrade ? 'Save Changes' : 'Save Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
