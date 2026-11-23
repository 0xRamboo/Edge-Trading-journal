import {
  Account,
  ChecklistRule,
  HardRiskRules,
  Strategy,
  Trade,
  TradeDirection,
} from '../types/trading';
import { convertCurrency } from './currency';
import {
  getDateKeyInTimezone,
  getHourInTimezone,
  getMonthKeyInTimezone,
  getWeekdayInTimezone,
  WEEKDAY_NAMES,
} from './timezone';

export interface PerformanceMetrics {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;            // 0-100
  profitFactor: number;       // Infinity if grossLoss === 0 && grossProfit > 0
  averageWin: number;
  averageLoss: number;        // Positive magnitude of avg loss
  winLossRatio: number;       // avgWin / avgLoss
  expectancyCurrency: number; // (win% * avgWin) - (loss% * avgLoss)
  expectancyR: number | null; // (win% * avgWinR) - (loss% * avgLossR)
  averageR: number | null;
  maxDrawdownValue: number;
  maxDrawdownPct: number;
  recoveryFactor: number;
  largestWin: number;
  largestLoss: number;        // Negative or 0
  currentStreak: number;      // Positive for wins, negative for losses
  longestWinStreak: number;
  longestLossStreak: number;
  avgHoldingMinutes: number;
  totalFees: number;
  avgPlannedRR: number | null;
  avgActualR: number | null;
  exitEfficiencyPct: number | null; // Average (netPnl / mfe) * 100 on winning trades with mfe > 0
}

export interface EquityPoint {
  index: number;
  dateKey: string;
  label: string;
  tradeId: string;
  instrument: string;
  tradePnl: number;
  equity: number;
  peak: number;
  drawdownValue: number;
  drawdownPct: number;
}

export interface DailyPnlPoint {
  dateKey: string;
  netPnl: number;
  trades: number;
  wins: number;
  losses: number;
  rulesFollowedCount: number;
  disciplinePct: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  averageR: number | null;
  expectancy: number;
  lowSampleWarning: boolean; // true when trades < 30
}

export interface DisciplineBreakdown {
  score: number; // 0-100
  rulesFollowedRate: number;
  checklistCompletionRate: number;
  riskLimitRespectedRate: number;
  planAdherenceRate: number;
  reasons: string[];
  trend: { label: string; score: number; trades: number }[];
}

export interface PatternAlert {
  id: string;
  severity: 'warning' | 'danger' | 'info';
  title: string;
  detail: string;
}

export interface MonteCarloResult {
  runs: number;
  horizon: number;
  startingBalance: number;
  riskOfRuinPct: number; // % of paths dropping >= 25% below starting balance
  medianFinalEquity: number;
  bestCaseFinalEquity: number;  // 95th percentile
  worstCaseFinalEquity: number; // 5th percentile
  series: { step: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
}

/**
 * Computes raw Gross P&L from entry/exit/direction/size/partials.
 * Long P&L = (exit - entry) * size * multiplier
 * Short P&L = (entry - exit) * size * multiplier
 */
export function computeTradeGrossPnl(params: {
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  size: number;
  contractMultiplier?: number;
  partialCloses?: { price: number; size: number; pnl?: number }[];
}): number {
  const mult = params.contractMultiplier && params.contractMultiplier > 0 ? params.contractMultiplier : 1;
  const partials = params.partialCloses ?? [];
  if (partials.length > 0) {
    let total = 0;
    let closedSize = 0;
    for (const p of partials) {
      closedSize += p.size;
      if (Number.isFinite(p.pnl)) {
        total += Number(p.pnl);
      } else {
        const diff = params.direction === 'LONG' ? p.price - params.entryPrice : params.entryPrice - p.price;
        total += diff * p.size * mult;
      }
    }
    const remSize = Math.max(0, params.size - closedSize);
    if (remSize > 0 && params.exitPrice !== null && Number.isFinite(params.exitPrice)) {
      const diff = params.direction === 'LONG' ? params.exitPrice - params.entryPrice : params.entryPrice - params.exitPrice;
      total += diff * remSize * mult;
    }
    return total;
  }

  if (params.exitPrice === null || !Number.isFinite(params.exitPrice)) return 0;
  const diff = params.direction === 'LONG' ? params.exitPrice - params.entryPrice : params.entryPrice - params.exitPrice;
  return diff * params.size * mult;
}

/**
 * Computes Planned R:R and Initial Risk Amount cleanly, returning null if SL is missing or invalid.
 * Planned R:R = |takeProfit - entryPrice| / |entryPrice - stopLoss|
 * R = netPnl / initialRisk
 */
export function computeRiskAndR(params: {
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number;
  contractMultiplier?: number;
  netPnl: number;
  explicitRiskAmount?: number | null;
}): {
  initialRiskAmount: number | null;
  plannedRR: number | null;
  actualR: number | null;
} {
  const mult = params.contractMultiplier && params.contractMultiplier > 0 ? params.contractMultiplier : 1;
  let initialRiskAmount: number | null =
    params.explicitRiskAmount !== undefined &&
    params.explicitRiskAmount !== null &&
    params.explicitRiskAmount > 0
      ? params.explicitRiskAmount
      : null;

  const hasValidSl =
    params.stopLoss !== null &&
    Number.isFinite(params.stopLoss) &&
    params.stopLoss > 0 &&
    params.entryPrice > 0 &&
    Math.abs(params.entryPrice - params.stopLoss) > 1e-12;

  if (initialRiskAmount === null && hasValidSl && params.size > 0) {
    initialRiskAmount = Math.abs(params.entryPrice - (params.stopLoss as number)) * params.size * mult;
  }

  let plannedRR: number | null = null;
  if (
    hasValidSl &&
    params.takeProfit !== null &&
    Number.isFinite(params.takeProfit) &&
    params.takeProfit > 0
  ) {
    const riskDist = Math.abs(params.entryPrice - (params.stopLoss as number));
    const rewardDist = Math.abs(params.takeProfit - params.entryPrice);
    if (riskDist > 1e-12) {
      plannedRR = rewardDist / riskDist;
    }
  }

  // R = netPnl / initialRisk
  let actualR: number | null = null;
  if (initialRiskAmount !== null && initialRiskAmount > 1e-9) {
    actualR = params.netPnl / initialRiskAmount;
  }

  return { initialRiskAmount, plannedRR, actualR };
}

/**
 * Helper to convert a trade's currency figure into the target display currency.
 */
export function getTradePnlInDisplayCurrency(
  trade: Trade,
  accountsMap: Map<string, Account>,
  displayCurrency: string
): number {
  const accCurrency = accountsMap.get(trade.accountId)?.currency ?? 'USD';
  return convertCurrency(trade.netPnl, accCurrency, displayCurrency);
}

/**
 * Computes full PerformanceMetrics + chronological EquityCurve for a list of trades.
 */
export function calculatePerformance(
  trades: Trade[],
  startingBalance: number,
  accountsMap: Map<string, Account>,
  displayCurrency: string,
  timeZone: string
): { metrics: PerformanceMetrics; equityCurve: EquityPoint[]; dailyPnl: DailyPnlPoint[] } {
  const openTrades = trades.filter((t) => t.status === 'OPEN').length;
  const closed = trades
    .filter((t) => t.status !== 'OPEN')
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.closeTime || a.openTime).getTime();
      const tb = new Date(b.closeTime || b.openTime).getTime();
      return ta - tb;
    });

  if (closed.length === 0) {
    return {
      metrics: {
        totalTrades: trades.length,
        closedTrades: 0,
        openTrades,
        wins: 0,
        losses: 0,
        breakevens: 0,
        netPnl: 0,
        grossProfit: 0,
        grossLoss: 0,
        winRate: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        winLossRatio: 0,
        expectancyCurrency: 0,
        expectancyR: null,
        averageR: null,
        maxDrawdownValue: 0,
        maxDrawdownPct: 0,
        recoveryFactor: 0,
        largestWin: 0,
        largestLoss: 0,
        currentStreak: 0,
        longestWinStreak: 0,
        longestLossStreak: 0,
        avgHoldingMinutes: 0,
        totalFees: 0,
        avgPlannedRR: null,
        avgActualR: null,
        exitEfficiencyPct: null,
      },
      equityCurve: [],
      dailyPnl: [],
    };
  }

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossProfit = 0;
  let grossLoss = 0; // positive magnitude
  let netPnl = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let totalHolding = 0;
  let totalFees = 0;

  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdownValue = 0;
  let maxDrawdownPct = 0;

  let currentStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let runningWinStreak = 0;
  let runningLossStreak = 0;

  const rValues: number[] = [];
  const winRs: number[] = [];
  const lossRs: number[] = [];
  const plannedRRs: number[] = [];
  const exitEffs: number[] = [];

  const equityCurve: EquityPoint[] = [];
  const dailyMap = new Map<string, DailyPnlPoint>();

  closed.forEach((t, idx) => {
    const accCur = accountsMap.get(t.accountId)?.currency ?? 'USD';
    const pnl = convertCurrency(t.netPnl, accCur, displayCurrency);
    const feeTotal = convertCurrency((t.fees || 0) + (t.commission || 0) + (t.swap || 0), accCur, displayCurrency);
    totalFees += feeTotal;
    netPnl += pnl;

    if (pnl > 0.0001) {
      wins += 1;
      grossProfit += pnl;
      if (pnl > largestWin) largestWin = pnl;
      runningWinStreak += 1;
      runningLossStreak = 0;
      if (runningWinStreak > longestWinStreak) longestWinStreak = runningWinStreak;
      currentStreak = runningWinStreak;
    } else if (pnl < -0.0001) {
      losses += 1;
      grossLoss += Math.abs(pnl);
      if (pnl < largestLoss) largestLoss = pnl;
      runningLossStreak += 1;
      runningWinStreak = 0;
      if (runningLossStreak > longestLossStreak) longestLossStreak = runningLossStreak;
      currentStreak = -runningLossStreak;
    } else {
      breakevens += 1;
    }

    if (t.actualR !== null && Number.isFinite(t.actualR)) {
      rValues.push(t.actualR);
      if (pnl > 0.0001) winRs.push(t.actualR);
      else if (pnl < -0.0001) lossRs.push(Math.abs(t.actualR));
    }
    if (t.plannedRR !== null && Number.isFinite(t.plannedRR)) {
      plannedRRs.push(t.plannedRR);
    }
    if (pnl > 0 && t.mfe !== null && t.mfe > 0) {
      const mfeDisp = convertCurrency(t.mfe, accCur, displayCurrency);
      if (mfeDisp > 0) {
        exitEffs.push(Math.min(100, Math.max(0, (pnl / mfeDisp) * 100)));
      }
    }

    totalHolding += Math.max(0, t.holdingTimeMinutes || 0);

    // Drawdown = peak-to-trough decline of equity
    equity += pnl;
    if (equity > peak) peak = equity;
    const ddValue = Math.max(0, peak - equity);
    const ddPct = peak > 0 ? (ddValue / peak) * 100 : 0;
    if (ddValue > maxDrawdownValue) maxDrawdownValue = ddValue;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    const dk = getDateKeyInTimezone(t.closeTime || t.openTime, timeZone);
    equityCurve.push({
      index: idx + 1,
      dateKey: dk,
      label: dk,
      tradeId: t.id,
      instrument: t.instrument,
      tradePnl: pnl,
      equity,
      peak,
      drawdownValue: ddValue,
      drawdownPct: ddPct,
    });

    if (dk) {
      const existing = dailyMap.get(dk) ?? {
        dateKey: dk,
        netPnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        rulesFollowedCount: 0,
        disciplinePct: 100,
      };
      existing.netPnl += pnl;
      existing.trades += 1;
      if (pnl > 0.0001) existing.wins += 1;
      else if (pnl < -0.0001) existing.losses += 1;
      if (t.rulesFollowed) existing.rulesFollowedCount += 1;
      existing.disciplinePct = (existing.rulesFollowedCount / existing.trades) * 100;
      dailyMap.set(dk, existing);
    }
  });

  const n = closed.length;
  const winRate = (wins / n) * 100;
  const winDec = wins / n;
  const lossDec = losses / n;

  // Profit factor = gross profit / gross loss
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  const averageWin = wins > 0 ? grossProfit / wins : 0;
  const averageLoss = losses > 0 ? grossLoss / losses : 0;
  const winLossRatio = averageLoss === 0 ? (averageWin > 0 ? Infinity : 0) : averageWin / averageLoss;

  // Expectancy = (win% * avg win) - (loss% * avg loss)
  const expectancyCurrency = winDec * averageWin - lossDec * averageLoss;

  const averageR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;
  let expectancyR: number | null = null;
  if (rValues.length > 0) {
    const avgWinR = winRs.length > 0 ? winRs.reduce((a, b) => a + b, 0) / winRs.length : 0;
    const avgLossR = lossRs.length > 0 ? lossRs.reduce((a, b) => a + b, 0) / lossRs.length : 0;
    const rWinRate = winRs.length / rValues.length;
    const rLossRate = lossRs.length / rValues.length;
    expectancyR = rWinRate * avgWinR - rLossRate * avgLossR;
  }

  const recoveryFactor = maxDrawdownValue > 0 ? netPnl / maxDrawdownValue : (netPnl > 0 ? Infinity : 0);

  const dailyPnl = Array.from(dailyMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    metrics: {
      totalTrades: trades.length,
      closedTrades: n,
      openTrades,
      wins,
      losses,
      breakevens,
      netPnl,
      grossProfit,
      grossLoss,
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      winLossRatio,
      expectancyCurrency,
      expectancyR,
      averageR,
      maxDrawdownValue,
      maxDrawdownPct,
      recoveryFactor,
      largestWin,
      largestLoss,
      currentStreak,
      longestWinStreak,
      longestLossStreak,
      avgHoldingMinutes: totalHolding / n,
      totalFees,
      avgPlannedRR: plannedRRs.length > 0 ? plannedRRs.reduce((a, b) => a + b, 0) / plannedRRs.length : null,
      avgActualR: averageR,
      exitEfficiencyPct: exitEffs.length > 0 ? exitEffs.reduce((a, b) => a + b, 0) / exitEffs.length : null,
    },
    equityCurve,
    dailyPnl,
  };
}

/**
 * Groups trades by a key selector and computes win rate, net P&L, profit factor, avg R, expectancy, and <30 sample warning.
 */
export function buildBreakdown(
  trades: Trade[],
  keyFn: (t: Trade) => string,
  accountsMap: Map<string, Account>,
  displayCurrency: string,
  labelFn?: (key: string) => string
): BreakdownRow[] {
  const closed = trades.filter((t) => t.status !== 'OPEN');
  const groups = new Map<string, Trade[]>();
  for (const t of closed) {
    const k = keyFn(t) || 'Unspecified';
    const arr = groups.get(k);
    if (arr) arr.push(t);
    else groups.set(k, [t]);
  }

  const rows: BreakdownRow[] = [];
  for (const [key, list] of groups.entries()) {
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let netPnl = 0;
    const rs: number[] = [];

    for (const t of list) {
      const accCur = accountsMap.get(t.accountId)?.currency ?? 'USD';
      const pnl = convertCurrency(t.netPnl, accCur, displayCurrency);
      netPnl += pnl;
      if (pnl > 0.0001) {
        wins += 1;
        grossProfit += pnl;
      } else if (pnl < -0.0001) {
        losses += 1;
        grossLoss += Math.abs(pnl);
      }
      if (t.actualR !== null && Number.isFinite(t.actualR)) {
        rs.push(t.actualR);
      }
    }

    const n = list.length;
    const winRate = (wins / n) * 100;
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const expectancy = (wins / n) * avgWin - (losses / n) * avgLoss;

    rows.push({
      key,
      label: labelFn ? labelFn(key) : key,
      trades: n,
      wins,
      losses,
      winRate,
      netPnl,
      profitFactor,
      averageR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      expectancy,
      lowSampleWarning: n < 30,
    });
  }

  return rows.sort((a, b) => b.netPnl - a.netPnl);
}

/**
 * Computes the Discipline Score (0–100), what lowered it, and its historical trend.
 */
export function calculateDisciplineScore(
  trades: Trade[],
  hardRules: HardRiskRules
): DisciplineBreakdown {
  if (trades.length === 0) {
    return {
      score: 100,
      rulesFollowedRate: 100,
      checklistCompletionRate: 100,
      riskLimitRespectedRate: 100,
      planAdherenceRate: 100,
      reasons: [],
      trend: [],
    };
  }

  const ordered = trades
    .slice()
    .sort((a, b) => new Date(a.openTime).getTime() - new Date(b.openTime).getTime());

  const computeForSlice = (slice: Trade[]) => {
    const n = slice.length;
    if (n === 0) return { score: 100, rulesRate: 100, checkRate: 100, riskRate: 100, planRate: 100 };
    const rulesFollowedCount = slice.filter((t) => t.rulesFollowed).length;
    const rulesRate = (rulesFollowedCount / n) * 100;

    let checkSum = 0;
    let checkCount = 0;
    for (const t of slice) {
      if (t.checklistResult && t.checklistResult.total > 0) {
        checkSum += (t.checklistResult.completed / t.checklistResult.total) * 100;
        checkCount += 1;
      }
    }
    const checkRate = checkCount > 0 ? checkSum / checkCount : 100;

    const riskOkCount = slice.filter((t) => {
      const overMax =
        t.initialRiskPct !== null &&
        Number.isFinite(t.initialRiskPct) &&
        t.initialRiskPct > hardRules.maxRiskPerTradePct + 0.05;
      const oversizedTag = t.mistakeTags.includes('Oversized');
      return !overMax && !oversizedTag;
    }).length;
    const riskRate = (riskOkCount / n) * 100;

    const noMistakeCount = slice.filter(
      (t) => t.mistakeTags.length === 0
    ).length;
    const planRate = (noMistakeCount / n) * 100;

    const score = Math.round(
      rulesRate * 0.35 + checkRate * 0.25 + riskRate * 0.25 + planRate * 0.15
    );
    return { score, rulesRate, checkRate, riskRate, planRate };
  };

  const overall = computeForSlice(ordered);
  const reasons: string[] = [];

  const brokenRules = ordered.filter((t) => !t.rulesFollowed).length;
  if (brokenRules > 0) {
    reasons.push(`${brokenRules} trade${brokenRules > 1 ? 's' : ''} marked "Rules Broken" (-${Math.round((100 - overall.rulesRate) * 0.35)} pts)`);
  }
  const incompleteChecks = ordered.filter(
    (t) => t.checklistResult && t.checklistResult.total > 0 && t.checklistResult.completed < t.checklistResult.total
  ).length;
  if (incompleteChecks > 0) {
    reasons.push(`${incompleteChecks} trade${incompleteChecks > 1 ? 's' : ''} skipped checklist items (-${Math.round((100 - overall.checkRate) * 0.25)} pts)`);
  }
  const riskBreaches = ordered.filter(
    (t) =>
      (t.initialRiskPct !== null && t.initialRiskPct > hardRules.maxRiskPerTradePct + 0.05) ||
      t.mistakeTags.includes('Oversized')
  ).length;
  if (riskBreaches > 0) {
    reasons.push(`${riskBreaches} trade${riskBreaches > 1 ? 's' : ''} exceeded ${hardRules.maxRiskPerTradePct}% risk limit (-${Math.round((100 - overall.riskRate) * 0.25)} pts)`);
  }
  const mistakeTrades = ordered.filter((t) => t.mistakeTags.length > 0).length;
  if (mistakeTrades > 0) {
    reasons.push(`${mistakeTrades} trade${mistakeTrades > 1 ? 's' : ''} logged execution mistakes (-${Math.round((100 - overall.planRate) * 0.15)} pts)`);
  }

  // Bucket into up to 8 chronological segments for trend
  const bucketCount = Math.min(8, Math.max(1, Math.ceil(ordered.length / 10)));
  const chunkSize = Math.ceil(ordered.length / bucketCount);
  const trend: { label: string; score: number; trades: number }[] = [];
  for (let i = 0; i < ordered.length; i += chunkSize) {
    const slice = ordered.slice(i, i + chunkSize);
    const res = computeForSlice(slice);
    trend.push({
      label: `#${i + 1}–${i + slice.length}`,
      score: res.score,
      trades: slice.length,
    });
  }

  return {
    score: overall.score,
    rulesFollowedRate: overall.rulesRate,
    checklistCompletionRate: overall.checkRate,
    riskLimitRespectedRate: overall.riskRate,
    planAdherenceRate: overall.planRate,
    reasons,
    trend,
  };
}

/**
 * Detects behavioral pattern alerts for the dashboard & AI Analyser.
 */
export function detectPatternAlerts(
  trades: Trade[],
  accountsMap: Map<string, Account>,
  displayCurrency: string,
  timeZone: string
): PatternAlert[] {
  const closed = trades
    .filter((t) => t.status !== 'OPEN')
    .slice()
    .sort((a, b) => new Date(a.closeTime || a.openTime).getTime() - new Date(b.closeTime || b.openTime).getTime());

  if (closed.length < 10) return [];
  const alerts: PatternAlert[] = [];

  // 1. After 3 consecutive losses: win rate on trade #4
  let after3Total = 0;
  let after3Wins = 0;
  let consecutiveLosses = 0;
  for (const t of closed) {
    const pnl = getTradePnlInDisplayCurrency(t, accountsMap, displayCurrency);
    if (consecutiveLosses >= 3) {
      after3Total += 1;
      if (pnl > 0) after3Wins += 1;
    }
    if (pnl < 0) consecutiveLosses += 1;
    else if (pnl > 0) consecutiveLosses = 0;
  }
  if (after3Total >= 3) {
    const wr = Math.round((after3Wins / after3Total) * 100);
    if (wr < 40) {
      alerts.push({
        id: 'post-3-loss',
        severity: 'danger',
        title: `Post-Streak Tilt Risk (${wr}% WR after 3 losses)`,
        detail: `Across ${after3Total} trades taken immediately after 3 consecutive losses, your win rate drops to ${wr}%. Consider a mandatory 2-hour cooldown after 3 losses.`,
      });
    }
  }

  // 2. Overtrading days (> 4 trades/day)
  const byDay = new Map<string, { count: number; pnl: number }>();
  for (const t of closed) {
    const dk = getDateKeyInTimezone(t.openTime, timeZone);
    const cur = byDay.get(dk) ?? { count: 0, pnl: 0 };
    cur.count += 1;
    cur.pnl += getTradePnlInDisplayCurrency(t, accountsMap, displayCurrency);
    byDay.set(dk, cur);
  }
  const highVolDays = Array.from(byDay.values()).filter((d) => d.count >= 4);
  if (highVolDays.length >= 2) {
    const highVolPnl = highVolDays.reduce((s, d) => s + d.pnl, 0);
    if (highVolPnl < 0) {
      alerts.push({
        id: 'overtrading',
        severity: 'warning',
        title: `Overtrading Leak (${highVolDays.length} high-frequency days)`,
        detail: `On days with 4+ trades, your cumulative P&L is ${highVolPnl.toFixed(0)} ${displayCurrency}. Tightening your daily max trade cap protects expectancy.`,
      });
    }
  }

  // 3. Worst weekday pattern
  const weekdayRows = buildBreakdown(
    closed,
    (t) => String(getWeekdayInTimezone(t.openTime, timeZone)),
    accountsMap,
    displayCurrency,
    (k) => WEEKDAY_NAMES[Number(k)] || k
  );
  const worstDay = weekdayRows.slice().sort((a, b) => a.netPnl - b.netPnl)[0];
  if (worstDay && worstDay.trades >= 5 && worstDay.netPnl < 0 && worstDay.winRate < 40) {
    alerts.push({
      id: 'worst-weekday',
      severity: 'warning',
      title: `Weak Day Pattern: ${worstDay.label} (${worstDay.winRate.toFixed(0)}% WR)`,
      detail: `${worstDay.label} has produced ${worstDay.netPnl.toFixed(0)} ${displayCurrency} across ${worstDay.trades} trades.`,
    });
  }

  // 4. Rules broken cost
  const broken = closed.filter((t) => !t.rulesFollowed);
  if (broken.length >= 3) {
    const brokenPnl = broken.reduce((s, t) => s + getTradePnlInDisplayCurrency(t, accountsMap, displayCurrency), 0);
    if (brokenPnl < 0) {
      alerts.push({
        id: 'rules-cost',
        severity: 'danger',
        title: `Rule Deviation Cost: ${brokenPnl.toFixed(0)} ${displayCurrency}`,
        detail: `${broken.length} trades where rules were broken netted ${brokenPnl.toFixed(0)} ${displayCurrency}.`,
      });
    }
  }

  return alerts;
}

/**
 * Deterministic-seeded or standard 1,000-run Monte Carlo equity simulation
 * bootstrapping historical closed trade P&Ls over `horizon` future trades.
 */
export function runMonteCarloSimulation(
  trades: Trade[],
  startingBalance: number,
  accountsMap: Map<string, Account>,
  displayCurrency: string,
  runs = 1000,
  horizon = 50
): MonteCarloResult | null {
  const closed = trades.filter((t) => t.status !== 'OPEN');
  if (closed.length < 5 || startingBalance <= 0) return null;

  const pnls = closed.map((t) => getTradePnlInDisplayCurrency(t, accountsMap, displayCurrency));
  const ruinThreshold = startingBalance * 0.75; // 25% drawdown ruin marker

  const pathsAtStep: number[][] = Array.from({ length: horizon + 1 }, () => []);
  let ruinedRuns = 0;

  // Use deterministic LCG so UI doesn't jump wildly on minor re-renders unless data changes
  let seed = (closed.length * 9301 + Math.round(startingBalance)) % 233280;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let r = 0; r < runs; r++) {
    let eq = startingBalance;
    let ruined = false;
    pathsAtStep[0].push(eq);
    for (let s = 1; s <= horizon; s++) {
      const sample = pnls[Math.floor(rand() * pnls.length)];
      eq = Math.max(0, eq + sample);
      if (eq <= ruinThreshold) ruined = true;
      pathsAtStep[s].push(eq);
    }
    if (ruined) ruinedRuns += 1;
  }

  const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

  const series = pathsAtStep.map((arr, step) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    return {
      step,
      p5: pct(sorted, 0.05),
      p25: pct(sorted, 0.25),
      p50: pct(sorted, 0.5),
      p75: pct(sorted, 0.75),
      p95: pct(sorted, 0.95),
    };
  });

  const last = series[series.length - 1];
  return {
    runs,
    horizon,
    startingBalance,
    riskOfRuinPct: (ruinedRuns / runs) * 100,
    medianFinalEquity: last.p50,
    bestCaseFinalEquity: last.p95,
    worstCaseFinalEquity: last.p5,
    series,
  };
}

/**
 * Generates compact journal snapshot JSON for AI Analyser & AI Chat.
 */
export function buildJournalContextForAi(
  trades: Trade[],
  accounts: Account[],
  strategies: Strategy[],
  checklistRules: ChecklistRule[],
  hardRules: HardRiskRules,
  displayCurrency: string,
  timeZone: string
) {
  const accountsMap = new Map(accounts.map((a) => [a.id, a]));
  const strategyMap = new Map(strategies.map((s) => [s.id, s.name]));
  const totalStart = accounts.reduce(
    (s, a) => s + convertCurrency(a.startingBalance, a.currency, displayCurrency),
    0
  );
  const { metrics } = calculatePerformance(trades, totalStart || 10000, accountsMap, displayCurrency, timeZone);
  const discipline = calculateDisciplineScore(trades, hardRules);

  const bySetup = buildBreakdown(trades, (t) => t.setup || 'Unspecified', accountsMap, displayCurrency);
  const byStrategy = buildBreakdown(
    trades,
    (t) => strategyMap.get(t.strategyId) || 'Unassigned',
    accountsMap,
    displayCurrency
  );
  const bySession = buildBreakdown(trades, (t) => t.session, accountsMap, displayCurrency);
  const byWeekday = buildBreakdown(
    trades,
    (t) => WEEKDAY_NAMES[getWeekdayInTimezone(t.openTime, timeZone)] || 'Mon',
    accountsMap,
    displayCurrency
  );
  const byHour = buildBreakdown(
    trades,
    (t) => `${String(getHourInTimezone(t.openTime, timeZone)).padStart(2, '0')}:00`,
    accountsMap,
    displayCurrency
  );
  const byMonth = buildBreakdown(
    trades,
    (t) => getMonthKeyInTimezone(t.openTime, timeZone) || 'Unknown',
    accountsMap,
    displayCurrency
  );

  // Cost of mistakes
  const mistakeCosts: Record<string, { count: number; netPnl: number }> = {};
  for (const t of trades) {
    const pnl = getTradePnlInDisplayCurrency(t, accountsMap, displayCurrency);
    for (const tag of t.mistakeTags) {
      if (!mistakeCosts[tag]) mistakeCosts[tag] = { count: 0, netPnl: 0 };
      mistakeCosts[tag].count += 1;
      mistakeCosts[tag].netPnl += pnl;
    }
  }

  const rulesFollowedStats = buildBreakdown(
    trades,
    (t) => (t.rulesFollowed ? 'Rules Followed' : 'Rules Broken'),
    accountsMap,
    displayCurrency
  );

  return {
    displayCurrency,
    timeZone,
    metrics,
    disciplineScore: discipline.score,
    disciplineReasons: discipline.reasons,
    bySetup: bySetup.slice(0, 12),
    byStrategy: byStrategy.slice(0, 12),
    bySession,
    byWeekday,
    byHour: byHour.slice(0, 24),
    byMonth: byMonth.slice(-12),
    mistakeCosts,
    rulesFollowedStats,
    checklistRuleCount: checklistRules.length,
  };
}
