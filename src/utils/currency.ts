export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NPR', 'USDT'] as const;

// Static reference exchange rates to USD for multi-account aggregation
const RATES_TO_USD: Record<string, number> = {
  USD: 1,
  USDT: 1,
  EUR: 1.08,
  GBP: 1.27,
  AUD: 0.66,
  CAD: 0.72,
  JPY: 0.0065,
  NPR: 0.0074,
};

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (!Number.isFinite(amount)) return 0;
  const from = (fromCurrency || 'USD').toUpperCase();
  const to = (toCurrency || 'USD').toUpperCase();
  if (from === to) return amount;
  const fromRate = RATES_TO_USD[from] ?? 1;
  const toRate = RATES_TO_USD[to] ?? 1;
  const inUsd = amount * fromRate;
  return inUsd / toRate;
}

export function formatCurrency(
  amount: number,
  currency = 'USD',
  options?: { signed?: boolean; compact?: boolean; decimals?: number }
): string {
  const val = Number.isFinite(amount) ? amount : 0;
  const cur = currency === 'USDT' ? 'USD' : currency || 'USD';
  const decimals = options?.decimals ?? (Math.abs(val) >= 1000 && options?.compact ? 1 : 2);

  if (options?.compact && Math.abs(val) >= 1000) {
    const abs = Math.abs(val);
    const formatted =
      abs >= 1_000_000
        ? `${(abs / 1_000_000).toFixed(2)}M`
        : `${(abs / 1000).toFixed(1)}k`;
    const symbol = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : `${cur} `;
    const sign = val < 0 ? '-' : options?.signed && val > 0 ? '+' : '';
    return `${sign}${symbol}${formatted}`;
  }

  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(val));
    const sign = val < 0 ? '-' : options?.signed && val > 0 ? '+' : '';
    return `${sign}${formatted}`;
  } catch {
    const sign = val < 0 ? '-' : options?.signed && val > 0 ? '+' : '';
    return `${sign}${cur} ${Math.abs(val).toFixed(decimals)}`;
  }
}

export function formatR(r: number | null | undefined, signed = true): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return 'N/A';
  const prefix = signed && r > 0 ? '+' : '';
  return `${prefix}${r.toFixed(2)}R`;
}

export function formatPercent(pct: number | null | undefined, signed = false): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const prefix = signed && pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(1)}%`;
}
