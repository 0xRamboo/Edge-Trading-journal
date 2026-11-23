export type MarketType = 'forex' | 'crypto' | 'stocks';
export type AccountType = 'live' | 'demo' | 'prop';
export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED' | 'PARTIAL';
export type TradingSession = 'Asia' | 'London' | 'New York' | 'Overlap';
export type CommissionModel = 'per_lot' | 'percentage' | 'flat' | 'zero';

export type PageId =
  | 'dashboard'
  | 'journal'
  | 'analysis'
  | 'weekly-plan'
  | 'daily-plan'
  | 'checklist'
  | 'backtesting'
  | 'strategy'
  | 'ai-analyser';

export type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd' | 'custom';

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD in selected timezone
  endDate: string;   // YYYY-MM-DD in selected timezone
}

export interface Account {
  id: string;
  name: string;
  broker: string;
  type: AccountType;
  startingBalance: number;
  currency: string; // Default 'USD'
  commissionModel: CommissionModel;
  commissionRate: number;
  archived: boolean;
  createdAt: string;
}

export interface EmotionLog {
  score: 1 | 2 | 3 | 4 | 5;
  tag: string;
}

export interface TradeScreenshot {
  id: string;
  stage: 'before' | 'entry' | 'after';
  dataUrl: string;
  caption?: string;
}

export interface PartialClose {
  id: string;
  price: number;
  size: number;
  time: string; // ISO
  pnl: number;
}

export interface ChecklistSnapshot {
  total: number;
  completed: number;
  requiredPassed: boolean;
  checkedRuleIds: string[];
}

export interface Trade {
  id: string;
  accountId: string;
  market: MarketType;
  instrument: string;
  direction: TradeDirection;
  status: TradeStatus;
  openTime: string;  // ISO 8601 UTC
  closeTime: string; // ISO 8601 UTC or '' if OPEN
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number;
  contractMultiplier?: number;
  initialRiskAmount: number | null; // Currency in account currency
  initialRiskPct: number | null;    // % of account equity at open
  fees: number;
  commission: number;
  swap: number;
  grossPnl: number;
  netPnl: number;
  plannedRR: number | null;
  actualR: number | null;
  mae: number | null; // Maximum Adverse Excursion (currency >= 0)
  mfe: number | null; // Maximum Favorable Excursion (currency >= 0)
  holdingTimeMinutes: number;
  setup: string;
  strategyId: string;
  session: TradingSession;
  emotionBefore: EmotionLog;
  emotionDuring: EmotionLog;
  emotionAfter: EmotionLog;
  mistakeTags: string[];
  customTags: string[];
  rulesFollowed: boolean;
  checklistResult: ChecklistSnapshot;
  notes: string;
  screenshots: TradeScreenshot[];
  partialCloses?: PartialClose[];
  isBacktest?: boolean;
  backtestSessionId?: string;
  marketCondition?: string;
  aiReview?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyJournal {
  dateKey: string; // YYYY-MM-DD
  mood: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  sleepHours: number;
  marketSummary: string;
  wentWell: string;
  toImprove: string;
  lessons: string;
  updatedAt: string;
}

export interface PairPlanEntry {
  id: string;
  instrument: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral' | 'Range';
  keyLevels: string;
  planNotes: string;
  preScreenshot?: string;
  afterScreenshot?: string;
  outcomeTag: 'Pending' | 'Played Out' | 'Invalidated' | 'No Trigger' | 'Missed';
  outcomeReview: string;
}

export interface WeeklyPlan {
  id: string; // YYYY-Www e.g. 2026-W47
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  marketBias: string;
  keyLevels: string;
  economicEvents: string;
  focusInstruments: string[];
  pnlGoal: number;
  processGoal: string;
  maxWeeklyLoss: number;
  maxTrades: number;
  whatWorked: string;
  whatToImprove: string;
  selfRating: 1 | 2 | 3 | 4 | 5;
  aiSummary?: string;
  pairPlans?: PairPlanEntry[];
  updatedAt: string;
}

export interface DailyPlan {
  dateKey: string; // YYYY-MM-DD
  bias: string;
  levels: string;
  news: string;
  aPlusSetups: string;
  maxTrades: number;
  maxDailyLoss: number;
  dailyGoal: string;
  eodFollowedPlan: 1 | 2 | 3 | 4 | 5;
  bestDecision: string;
  worstDecision: string;
  emotionSummary: string;
  pairPlans?: PairPlanEntry[];
  updatedAt: string;
}

export interface ChecklistRule {
  id: string;
  phase: 'pre' | 'during' | 'post';
  text: string;
  required: boolean;
  order: number;
  active: boolean;
}

export type StrategyStatus = 'Testing' | 'Live' | 'Retired';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  marketConditions: string;
  entryRules: string;
  exitRules: string;
  riskRules: string;
  invalidation: string;
  status: StrategyStatus;
  versionNotes: string;
  exampleScreenshots: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BacktestReadyCriteria {
  minTrades: number;
  minProfitFactor: number;
  maxDrawdownPct: number;
  minMarketConditions: number;
}

export interface BacktestSession {
  id: string;
  name: string;
  strategyId: string;
  instrument: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  riskPerTradePct: number;
  currency: string;
  readyCriteria: BacktestReadyCriteria;
  createdAt: string;
}

export interface CsvPreset {
  id: string;
  name: string;
  broker: string;
  timezone: string;
  mapping: Record<string, string>;
  createdAt: string;
}

export interface AiReportContent {
  executiveSummary: string;
  strengths: string[];
  weaknesses: string[];
  behavioralPatterns: string[];
  bestAndWorst: string;
  ruleComplianceAnalysis: string;
  periodComparison: string;
  actionItems: string[];
}

export interface AiReport {
  id: string;
  periodType: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  startDate: string;
  endDate: string;
  accountId: string; // 'ALL' or account.id
  accountLabel: string;
  createdAt: string;
  statsSnapshot: Record<string, number | string>;
  content: AiReportContent;
}

export interface HardRiskRules {
  maxRiskPerTradePct: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
}

export interface AppSettings {
  id: string;
  displayCurrency: string; // 'USD'
  timezone: string;        // 'Asia/Kathmandu'
  theme: 'dark' | 'light';
  hardRiskRules: HardRiskRules;
}

export const MISTAKE_TAGS = [
  'FOMO',
  'Revenge',
  'Moved SL',
  'Early Exit',
  'Oversized',
  'No Setup',
  'Ignored Plan',
] as const;

export const EMOTION_TAGS = [
  'Calm',
  'Focused',
  'Confident',
  'Anxious',
  'Impatient',
  'Greedy',
  'Fearful',
  'Frustrated',
  'Euphoric',
  'Fatigued',
] as const;

export const MARKET_CONDITIONS = [
  'Trending Up',
  'Trending Down',
  'Range / Consolidation',
  'High Volatility',
  'Low Liquidity / Pre-News',
] as const;
