import { Account, Strategy, Trade } from '../types/trading';
import { formatDateTimeInTimezone } from './timezone';

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportTradesToCsv(
  trades: Trade[],
  accounts: Account[],
  strategies: Strategy[],
  timeZone: string
): string {
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const stratMap = new Map(strategies.map((s) => [s.id, s.name]));

  const headers = [
    'ID',
    'Account',
    'Market',
    'Instrument',
    'Direction',
    'Status',
    `Open Time (${timeZone})`,
    `Close Time (${timeZone})`,
    'Entry Price',
    'Exit Price',
    'Stop Loss',
    'Take Profit',
    'Size',
    'Initial Risk ($)',
    'Initial Risk (%)',
    'Fees',
    'Commission',
    'Swap',
    'Gross P&L',
    'Net P&L',
    'Planned R:R',
    'Actual R',
    'MAE',
    'MFE',
    'Holding Time (min)',
    'Setup',
    'Strategy',
    'Session',
    'Rules Followed',
    'Checklist',
    'Mistake Tags',
    'Custom Tags',
    'Emotion Before',
    'Emotion During',
    'Emotion After',
    'Notes',
    'Is Backtest',
  ];

  const rows = trades.map((t) =>
    [
      t.id,
      accMap.get(t.accountId) ?? t.accountId,
      t.market,
      t.instrument,
      t.direction,
      t.status,
      formatDateTimeInTimezone(t.openTime, timeZone),
      formatDateTimeInTimezone(t.closeTime, timeZone),
      t.entryPrice,
      t.exitPrice ?? '',
      t.stopLoss ?? '',
      t.takeProfit ?? '',
      t.size,
      t.initialRiskAmount ?? '',
      t.initialRiskPct ?? '',
      t.fees,
      t.commission,
      t.swap,
      t.grossPnl,
      t.netPnl,
      t.plannedRR ?? '',
      t.actualR ?? '',
      t.mae ?? '',
      t.mfe ?? '',
      t.holdingTimeMinutes,
      t.setup,
      stratMap.get(t.strategyId) ?? '',
      t.session,
      t.rulesFollowed ? 'Yes' : 'No',
      `${t.checklistResult?.completed ?? 0}/${t.checklistResult?.total ?? 0}`,
      t.mistakeTags.join('; '),
      t.customTags.join('; '),
      `${t.emotionBefore.score} (${t.emotionBefore.tag})`,
      `${t.emotionDuring.score} (${t.emotionDuring.tag})`,
      `${t.emotionAfter.score} (${t.emotionAfter.tag})`,
      t.notes,
      t.isBacktest ? 'Yes' : 'No',
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [headers.map(escapeCsv).join(','), ...rows].join('\n');
}

export function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
