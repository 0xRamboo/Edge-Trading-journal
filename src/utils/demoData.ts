import {
  Account,
  BacktestSession,
  ChecklistRule,
  DailyJournal,
  DailyPlan,
  EMOTION_TAGS,
  MARKET_CONDITIONS,
  MISTAKE_TAGS,
  MarketType,
  Strategy,
  Trade,
  TradingSession,
  WeeklyPlan,
} from '../types/trading';
import { getDateKeyInTimezone, getTodayKeyInTimezone, getWeekBoundsFromDateKey, getWeekIdFromDateKey, shiftDateKey } from './timezone';

export const DEFAULT_CHECKLIST_RULES: ChecklistRule[] = [
  { id: 'rule-pre-1', phase: 'pre', text: 'Higher-timeframe market structure & bias aligned', required: true, order: 1, active: true },
  { id: 'rule-pre-2', phase: 'pre', text: 'Price at pre-defined key liquidity or demand/supply level', required: true, order: 2, active: true },
  { id: 'rule-pre-3', phase: 'pre', text: 'Stop loss placed at structural invalidation (not arbitrary)', required: true, order: 3, active: true },
  { id: 'rule-pre-4', phase: 'pre', text: 'Risk sized <= 1.5% of account equity', required: true, order: 4, active: true },
  { id: 'rule-pre-5', phase: 'pre', text: 'No high-impact red-folder news within 15 minutes', required: false, order: 5, active: true },
  { id: 'rule-dur-1', phase: 'during', text: 'Do not widen stop loss after entry', required: true, order: 6, active: true },
  { id: 'rule-dur-2', phase: 'during', text: 'Trail stop or take partials only per playbook rules', required: false, order: 7, active: true },
  { id: 'rule-post-1', phase: 'post', text: 'Capture exit screenshot & log emotional state honestly', required: true, order: 8, active: true },
  { id: 'rule-post-2', phase: 'post', text: 'Step away for 15 minutes after any loss before scanning again', required: false, order: 9, active: true },
];

function seededRng(seedInit = 4219) {
  let s = seedInit;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function generateDemoDataset(timeZone = 'Asia/Kathmandu'): {
  accounts: Account[];
  strategies: Strategy[];
  checklistRules: ChecklistRule[];
  trades: Trade[];
  dailyJournals: DailyJournal[];
  weeklyPlans: WeeklyPlan[];
  dailyPlans: DailyPlan[];
  backtestSessions: BacktestSession[];
} {
  const rand = seededRng(20261123);
  const nowIso = new Date().toISOString();

  const accounts: Account[] = [
    {
      id: 'acc-fx-live',
      name: 'IC Markets Raw FX',
      broker: 'IC Markets',
      type: 'live',
      startingBalance: 25000,
      currency: 'USD',
      commissionModel: 'per_lot',
      commissionRate: 7,
      archived: false,
      createdAt: nowIso,
    },
    {
      id: 'acc-crypto-perp',
      name: 'Bybit Perps Main',
      broker: 'Bybit',
      type: 'live',
      startingBalance: 15000,
      currency: 'USD',
      commissionModel: 'percentage',
      commissionRate: 0.055,
      archived: false,
      createdAt: nowIso,
    },
    {
      id: 'acc-stocks-ibkr',
      name: 'IBKR US Equities',
      broker: 'Interactive Brokers',
      type: 'live',
      startingBalance: 40000,
      currency: 'USD',
      commissionModel: 'flat',
      commissionRate: 2.5,
      archived: false,
      createdAt: nowIso,
    },
    {
      id: 'acc-prop-ftmo',
      name: 'FTMO 100K Challenge',
      broker: 'FTMO',
      type: 'prop',
      startingBalance: 100000,
      currency: 'USD',
      commissionModel: 'per_lot',
      commissionRate: 5,
      archived: false,
      createdAt: nowIso,
    },
  ];

  const strategies: Strategy[] = [
    {
      id: 'strat-liq-sweep',
      name: 'London Liquidity Sweep',
      description: 'Fade stop hunts above/below Asian session highs & lows back into HTF orderflow.',
      marketConditions: 'Range expansion during London Open / NY Overlap with clear Asian extremes.',
      entryRules: '1) Sweep of Asia H/L.\n2) 5m MSS with displacement FVG.\n3) Limit at 50% FVG or OB.',
      exitRules: '50% off at 2R opposing liquidity, runner trailed behind 15m swing structure.',
      riskRules: 'Fixed 1.0% risk per trade. Max 2 attempts per session.',
      invalidation: '15m candle close cleanly outside the swept liquidity extreme.',
      status: 'Live',
      versionNotes: 'v2.4 — Removed counter-trend sweeps on FOMC days.',
      exampleScreenshots: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'strat-orb',
      name: 'NY Opening Range Breakout',
      description: 'Momentum continuation out of the first 15-minute NYSE / Crypto US open range.',
      marketConditions: 'High relative volume (>1.5x 20-day avg) and clear directional catalyst.',
      entryRules: '1) Wait for 15m ORB high/low.\n2) Enter on retest of ORB boundary with VWAP alignment.',
      exitRules: 'Full exit at 2.5R or VWAP cross against position.',
      riskRules: '0.75% risk per trade. Hard stop at opposite side of 15m range or midpoint.',
      invalidation: 'Failure back inside the 15m range on elevated volume.',
      status: 'Live',
      versionNotes: 'v1.8 — Added VWAP confluence filter.',
      exampleScreenshots: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'strat-trend-pb',
      name: '4H Trend Pullback EMA21',
      description: 'Swing continuation entering 1H structure pullbacks into 4H EMA21 + Fib 0.618 zone.',
      marketConditions: 'Strong trending market (ADX > 25, clear HH/HL or LH/LL).',
      entryRules: '1) 4H trend confirmed.\n2) 1H bullish/bearish engulfing off EMA21.',
      exitRules: 'Scale 50% at prior swing H/L (approx 1.8R), trail remainder on 4H ATR.',
      riskRules: '1.0% risk per position, max 2 concurrent positions.',
      invalidation: '4H close beyond EMA50.',
      status: 'Live',
      versionNotes: 'v3.0 — Tightened invalidation to reduce average holding drag.',
      exampleScreenshots: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'strat-mean-rev',
      name: 'Asia Range Mean Reversion',
      description: 'Range-bound fades at Bollinger 2.5SD extremes during quiet Asia hours.',
      marketConditions: 'Low volatility, no scheduled central bank releases.',
      entryRules: 'RSI divergence + rejection wick at range boundary.',
      exitRules: 'Target mid-range VWAP (1.5R).',
      riskRules: '0.5% risk per trade.',
      invalidation: 'Range expansion > 1.5x ATR.',
      status: 'Testing',
      versionNotes: 'v1.1 — Under active backtest verification.',
      exampleScreenshots: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const instrumentSpecs: {
    instrument: string;
    market: MarketType;
    accountId: string;
    basePrice: number;
    pipMove: number;
    sizeDefault: number;
    mult: number;
  }[] = [
    { instrument: 'EURUSD', market: 'forex', accountId: 'acc-fx-live', basePrice: 1.084, pipMove: 0.0025, sizeDefault: 1.5, mult: 100000 },
    { instrument: 'GBPUSD', market: 'forex', accountId: 'acc-fx-live', basePrice: 1.268, pipMove: 0.0032, sizeDefault: 1.2, mult: 100000 },
    { instrument: 'XAUUSD', market: 'forex', accountId: 'acc-prop-ftmo', basePrice: 2645, pipMove: 8.5, sizeDefault: 1.0, mult: 100 },
    { instrument: 'USDJPY', market: 'forex', accountId: 'acc-prop-ftmo', basePrice: 153.2, pipMove: 0.45, sizeDefault: 2.0, mult: 1000 },
    { instrument: 'BTCUSDT', market: 'crypto', accountId: 'acc-crypto-perp', basePrice: 91200, pipMove: 850, sizeDefault: 0.25, mult: 1 },
    { instrument: 'ETHUSDT', market: 'crypto', accountId: 'acc-crypto-perp', basePrice: 3180, pipMove: 48, sizeDefault: 4.0, mult: 1 },
    { instrument: 'SOLUSDT', market: 'crypto', accountId: 'acc-crypto-perp', basePrice: 215, pipMove: 5.5, sizeDefault: 35, mult: 1 },
    { instrument: 'NVDA', market: 'stocks', accountId: 'acc-stocks-ibkr', basePrice: 142.5, pipMove: 2.6, sizeDefault: 150, mult: 1 },
    { instrument: 'AAPL', market: 'stocks', accountId: 'acc-stocks-ibkr', basePrice: 229.0, pipMove: 2.4, sizeDefault: 160, mult: 1 },
    { instrument: 'SPY', market: 'stocks', accountId: 'acc-stocks-ibkr', basePrice: 594.0, pipMove: 3.1, sizeDefault: 120, mult: 1 },
  ];

  const setups = ['Sweep + FVG', 'ORB Retest', 'EMA21 Pullback', 'Breaker Block', 'VWAP Reclaim', 'Impulse Continuation'];
  const sessions: TradingSession[] = ['Asia', 'London', 'New York', 'Overlap'];

  const trades: Trade[] = [];
  const todayKey = getTodayKeyInTimezone(timeZone);
  const totalLiveTrades = 152;

  for (let i = 0; i < totalLiveTrades; i++) {
    // Spread across last 115 days up to today
    const daysAgo = Math.floor(((totalLiveTrades - 1 - i) / totalLiveTrades) * 115);
    const dk = shiftDateKey(todayKey, -daysAgo);
    const [y, m, d] = dk.split('-').map(Number);

    // Pick session & realistic hour (UTC)
    const sessionPick = rand();
    let session: TradingSession = 'London';
    let utcHour = 8;
    if (sessionPick < 0.16) {
      session = 'Asia';
      utcHour = 2 + Math.floor(rand() * 4);
    } else if (sessionPick < 0.46) {
      session = 'London';
      utcHour = 7 + Math.floor(rand() * 4);
    } else if (sessionPick < 0.72) {
      session = 'Overlap';
      utcHour = 12 + Math.floor(rand() * 3);
    } else {
      session = 'New York';
      utcHour = 15 + Math.floor(rand() * 4);
    }

    const openDate = new Date(Date.UTC(y, m - 1, d, utcHour, Math.floor(rand() * 55), 0));
    const holdingMinutes = Math.round(18 + rand() * 260);
    const closeDate = new Date(openDate.getTime() + holdingMinutes * 60000);

    const spec = instrumentSpecs[Math.floor(rand() * instrumentSpecs.length)];
    const strategy = strategies[Math.floor(rand() * (rand() > 0.15 ? 3 : 4))];
    const account = accounts.find((a) => a.id === spec.accountId)!;

    // Realistic edge: London & Overlap + rulesFollowed have higher win rate; Fridays & FOMO/Revenge underperform
    const dayOfWeek = openDate.getUTCDay();
    const isFriday = dayOfWeek === 5;
    const brokeRules = rand() < (isFriday ? 0.34 : 0.18);
    const rulesFollowed = !brokeRules;

    const mistakeTags: string[] = [];
    if (brokeRules) {
      const m1 = MISTAKE_TAGS[Math.floor(rand() * MISTAKE_TAGS.length)];
      mistakeTags.push(m1);
      if (rand() < 0.35) {
        const m2 = MISTAKE_TAGS[Math.floor(rand() * MISTAKE_TAGS.length)];
        if (m2 !== m1) mistakeTags.push(m2);
      }
    }

    // Risk per trade (~0.8% - 1.2%, or oversized if Oversized tag)
    const baseRiskPct = mistakeTags.includes('Oversized') ? 2.1 + rand() * 0.9 : 0.75 + rand() * 0.65;
    const initialRiskAmount = Number(((account.startingBalance * baseRiskPct) / 100).toFixed(2));

    // Win probability depends on rulesFollowed & session
    let winProb = 0.56;
    if (!rulesFollowed) winProb -= 0.25;
    if (session === 'Asia') winProb -= 0.08;
    if (isFriday) winProb -= 0.12;
    if (strategy.id === 'strat-liq-sweep') winProb += 0.05;

    const isWin = rand() < winProb;
    const plannedRR = Number((1.8 + rand() * 1.4).toFixed(2));
    let actualR: number;
    if (isWin) {
      if (mistakeTags.includes('Early Exit')) {
        actualR = Number((0.45 + rand() * 0.7).toFixed(2));
      } else {
        actualR = Number((0.9 + rand() * (plannedRR - 0.5 + 0.6)).toFixed(2));
      }
    } else {
      if (mistakeTags.includes('Moved SL')) {
        actualR = Number(-(1.35 + rand() * 0.85).toFixed(2));
      } else {
        actualR = Number(-(0.85 + rand() * 0.2).toFixed(2));
      }
    }

    const direction = rand() > 0.48 ? 'LONG' : 'SHORT';
    const priceDrift = (rand() - 0.5) * spec.pipMove * 8;
    const entryPrice = Number((spec.basePrice + priceDrift).toFixed(spec.market === 'forex' && spec.basePrice < 5 ? 5 : 2));
    const stopDist = spec.pipMove * (0.8 + rand() * 0.6);
    const stopLoss = Number((direction === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist).toFixed(spec.market === 'forex' && spec.basePrice < 5 ? 5 : 2));
    const takeProfit = Number((direction === 'LONG' ? entryPrice + stopDist * plannedRR : entryPrice - stopDist * plannedRR).toFixed(spec.market === 'forex' && spec.basePrice < 5 ? 5 : 2));

    // Compute exact exit price from actualR
    const exitPrice = Number(
      (direction === 'LONG' ? entryPrice + stopDist * actualR : entryPrice - stopDist * actualR).toFixed(
        spec.market === 'forex' && spec.basePrice < 5 ? 5 : 2
      )
    );

    // Derive net P&L cleanly from initialRiskAmount * actualR minus small fees
    const fees = Number((initialRiskAmount * (0.015 + rand() * 0.025)).toFixed(2));
    const commission = Number((fees * 0.7).toFixed(2));
    const swap = holdingMinutes > 180 ? Number((rand() * 4).toFixed(2)) : 0;
    const grossPnl = Number((initialRiskAmount * actualR + fees).toFixed(2));
    const netPnl = Number((grossPnl - fees).toFixed(2));
    const derivedActualR = Number((netPnl / initialRiskAmount).toFixed(2));

    const mae = Number(
      (isWin
        ? initialRiskAmount * (0.15 + rand() * 0.55)
        : Math.abs(netPnl) * (1.02 + rand() * 0.15)
      ).toFixed(2)
    );
    const mfe = Number(
      (isWin
        ? netPnl * (1.05 + rand() * 0.35)
        : initialRiskAmount * (0.2 + rand() * 0.9)
      ).toFixed(2)
    );

    const checkTotal = 5;
    const checkCompleted = rulesFollowed ? (rand() > 0.2 ? 5 : 4) : Math.floor(2 + rand() * 2);

    const emotionScoreBefore = (rulesFollowed ? Math.floor(3 + rand() * 3) : Math.floor(1 + rand() * 3)) as 1 | 2 | 3 | 4 | 5;
    const emotionScoreDuring = (isWin ? Math.floor(3 + rand() * 3) : Math.floor(2 + rand() * 2)) as 1 | 2 | 3 | 4 | 5;
    const emotionScoreAfter = (isWin ? Math.floor(4 + rand() * 2) : Math.floor(1 + rand() * 3)) as 1 | 2 | 3 | 4 | 5;

    const pickTag = (score: number) =>
      score >= 4
        ? EMOTION_TAGS[Math.floor(rand() * 3)]
        : EMOTION_TAGS[3 + Math.floor(rand() * (EMOTION_TAGS.length - 3))];

    const setup = setups[Math.floor(rand() * setups.length)];
    const isLastOpen = i === totalLiveTrades - 1 && rand() > 0.5;

    trades.push({
      id: `demo-tr-${String(i + 1).padStart(4, '0')}`,
      accountId: account.id,
      market: spec.market,
      instrument: spec.instrument,
      direction,
      status: isLastOpen ? 'OPEN' : 'CLOSED',
      openTime: openDate.toISOString(),
      closeTime: isLastOpen ? '' : closeDate.toISOString(),
      entryPrice,
      exitPrice: isLastOpen ? null : exitPrice,
      stopLoss,
      takeProfit,
      size: spec.sizeDefault,
      contractMultiplier: spec.mult,
      initialRiskAmount,
      initialRiskPct: Number(baseRiskPct.toFixed(2)),
      fees: Number((fees * 0.3).toFixed(2)),
      commission,
      swap,
      grossPnl: isLastOpen ? 0 : grossPnl,
      netPnl: isLastOpen ? 0 : netPnl,
      plannedRR,
      actualR: isLastOpen ? null : derivedActualR,
      mae: isLastOpen ? null : mae,
      mfe: isLastOpen ? null : mfe,
      holdingTimeMinutes: isLastOpen ? 0 : holdingMinutes,
      setup,
      strategyId: strategy.id,
      session,
      emotionBefore: { score: emotionScoreBefore, tag: pickTag(emotionScoreBefore) },
      emotionDuring: { score: emotionScoreDuring, tag: pickTag(emotionScoreDuring) },
      emotionAfter: { score: emotionScoreAfter, tag: pickTag(emotionScoreAfter) },
      mistakeTags,
      customTags: [spec.market, isWin ? 'a-plus' : 'review'],
      rulesFollowed,
      checklistResult: {
        total: checkTotal,
        completed: checkCompleted,
        requiredPassed: rulesFollowed,
        checkedRuleIds: DEFAULT_CHECKLIST_RULES.slice(0, checkCompleted).map((r) => r.id),
      },
      notes: rulesFollowed
        ? `Clean ${setup} execution during ${session} session. Waited for confirmation at key level.`
        : `Deviated from plan (${mistakeTags.join(', ')}). Entered slightly early before HTF confirmation.`,
      screenshots: [],
      marketCondition: MARKET_CONDITIONS[Math.floor(rand() * MARKET_CONDITIONS.length)],
      createdAt: openDate.toISOString(),
      updatedAt: (isLastOpen ? openDate : closeDate).toISOString(),
    });
  }

  // Backtest session + 36 backtest trades for "London Liquidity Sweep"
  const btSession: BacktestSession = {
    id: 'bt-london-sweep-q3',
    name: 'EURUSD London Sweep 2026 Q3',
    strategyId: 'strat-liq-sweep',
    instrument: 'EURUSD',
    timeframe: '15m / 5m',
    startDate: shiftDateKey(todayKey, -90),
    endDate: shiftDateKey(todayKey, -10),
    startingBalance: 25000,
    riskPerTradePct: 1.0,
    currency: 'USD',
    readyCriteria: {
      minTrades: 100,
      minProfitFactor: 1.5,
      maxDrawdownPct: 10,
      minMarketConditions: 3,
    },
    createdAt: nowIso,
  };

  for (let b = 0; b < 36; b++) {
    const dk = shiftDateKey(todayKey, -90 + b * 2);
    const [y, m, d] = dk.split('-').map(Number);
    const openDate = new Date(Date.UTC(y, m - 1, d, 8, 15, 0));
    const closeDate = new Date(openDate.getTime() + (35 + Math.floor(rand() * 90)) * 60000);
    const isWin = rand() < 0.61;
    const actualR = isWin ? Number((1.4 + rand() * 1.4).toFixed(2)) : -1.0;
    const riskAmt = 250;
    const netPnl = Number((riskAmt * actualR - 7).toFixed(2));
    trades.push({
      id: `demo-bt-${String(b + 1).padStart(3, '0')}`,
      accountId: 'acc-fx-live',
      market: 'forex',
      instrument: 'EURUSD',
      direction: rand() > 0.5 ? 'LONG' : 'SHORT',
      status: 'CLOSED',
      openTime: openDate.toISOString(),
      closeTime: closeDate.toISOString(),
      entryPrice: 1.085,
      exitPrice: isWin ? 1.0895 : 1.0825,
      stopLoss: 1.0825,
      takeProfit: 1.09,
      size: 1.0,
      contractMultiplier: 100000,
      initialRiskAmount: riskAmt,
      initialRiskPct: 1.0,
      fees: 0,
      commission: 7,
      swap: 0,
      grossPnl: netPnl + 7,
      netPnl,
      plannedRR: 2.0,
      actualR: Number((netPnl / riskAmt).toFixed(2)),
      mae: isWin ? 75 : 250,
      mfe: isWin ? netPnl * 1.15 : 110,
      holdingTimeMinutes: 65,
      setup: 'Sweep + FVG',
      strategyId: 'strat-liq-sweep',
      session: b % 3 === 0 ? 'Overlap' : 'London',
      emotionBefore: { score: 4, tag: 'Focused' },
      emotionDuring: { score: 4, tag: 'Calm' },
      emotionAfter: { score: 4, tag: 'Calm' },
      mistakeTags: [],
      customTags: ['backtest'],
      rulesFollowed: true,
      checklistResult: { total: 5, completed: 5, requiredPassed: true, checkedRuleIds: DEFAULT_CHECKLIST_RULES.slice(0, 5).map((r) => r.id) },
      notes: 'Replay verification trade.',
      screenshots: [],
      isBacktest: true,
      backtestSessionId: btSession.id,
      marketCondition: MARKET_CONDITIONS[b % 4],
      createdAt: openDate.toISOString(),
      updatedAt: closeDate.toISOString(),
    });
  }

  // Daily Journals for recent 10 days
  const dailyJournals: DailyJournal[] = Array.from({ length: 10 }, (_, idx) => {
    const dk = shiftDateKey(todayKey, -idx);
    return {
      dateKey: dk,
      mood: ((idx % 3) + 3) as 1 | 2 | 3 | 4 | 5,
      energy: ((idx % 2) + 4) as 1 | 2 | 3 | 4 | 5,
      sleepHours: 7 + (idx % 2) * 0.5,
      marketSummary: idx % 2 === 0 ? 'London session swept Asian lows cleanly before NY continuation.' : 'Choppy pre-CPI consolidation; reduced position size.',
      wentWell: 'Patience waiting for 5m displacement before entering.',
      toImprove: 'Avoid forcing secondary setups during late NY afternoon.',
      lessons: 'A+ setups alone carry weekly expectancy when losers stay capped at -1R.',
      updatedAt: nowIso,
    };
  });

  // Current & prior week plans
  const curWeekId = getWeekIdFromDateKey(todayKey);
  const curBounds = getWeekBoundsFromDateKey(todayKey);
  const prevKey = shiftDateKey(todayKey, -7);
  const prevWeekId = getWeekIdFromDateKey(prevKey);
  const prevBounds = getWeekBoundsFromDateKey(prevKey);

  const weeklyPlans: WeeklyPlan[] = [
    {
      id: curWeekId,
      weekStart: curBounds.weekStart,
      weekEnd: curBounds.weekEnd,
      marketBias: 'EURUSD bullish above 1.0800; BTCUSDT consolidating above 90k support; US tech constructive.',
      keyLevels: 'EURUSD 1.0805 / 1.0920 | XAUUSD 2625 / 2675 | BTC 89,500 / 93,800',
      economicEvents: 'Wed FOMC Minutes · Thu US Jobless Claims · Fri Core PCE',
      focusInstruments: ['EURUSD', 'XAUUSD', 'BTCUSDT', 'NVDA'],
      pnlGoal: 2400,
      processGoal: 'Zero revenge trades and 100% checklist completion prior to order entry.',
      maxWeeklyLoss: 1500,
      maxTrades: 16,
      whatWorked: 'Selective London Open entries and letting runners reach opposing HTF liquidity.',
      whatToImprove: 'Cut Friday afternoon size in half.',
      selfRating: 4,
      updatedAt: nowIso,
    },
    {
      id: prevWeekId,
      weekStart: prevBounds.weekStart,
      weekEnd: prevBounds.weekEnd,
      marketBias: 'Neutral-bullish dollar pullback; focus on London liquidity sweeps.',
      keyLevels: 'EURUSD 1.0760 / 1.0880 | SPY 588 / 598',
      economicEvents: 'Tue CPI · Thu PPI',
      focusInstruments: ['EURUSD', 'GBPUSD', 'SPY'],
      pnlGoal: 2000,
      processGoal: 'Respect 2-trade daily cap after any red morning.',
      maxWeeklyLoss: 1400,
      maxTrades: 15,
      whatWorked: 'Followed stop rules on Tuesday CPI volatility.',
      whatToImprove: 'Entered one early ORB without VWAP confirmation on Thursday.',
      selfRating: 4,
      updatedAt: nowIso,
    },
  ];

  // Daily plans for today and yesterday
  const dailyPlans: DailyPlan[] = [
    {
      dateKey: todayKey,
      bias: 'Look for London sweep of Asian low on EURUSD and XAUUSD; watch NVDA above prior day high.',
      levels: 'EURUSD 1.0820 / 1.0890 | XAUUSD 2635 / 2668 | BTC 90,800',
      news: '19:15 NPT (UTC+5:45) US Flash PMI',
      aPlusSetups: 'Sweep + FVG, ORB Retest with VWAP confluence',
      maxTrades: 3,
      maxDailyLoss: 600,
      dailyGoal: 'Execute only planned A+ alerts; stop immediately if 2 losses occur.',
      eodFollowedPlan: 4,
      bestDecision: 'Skipped choppy Asia range and waited for London displacement.',
      worstDecision: 'Hesitated on partial take-profit at 2R.',
      emotionSummary: 'Calm and disciplined through the session.',
      updatedAt: nowIso,
    },
  ];

  return {
    accounts,
    strategies,
    checklistRules: DEFAULT_CHECKLIST_RULES,
    trades,
    dailyJournals,
    weeklyPlans,
    dailyPlans,
    backtestSessions: [btSession],
  };
}
