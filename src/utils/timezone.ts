export const SUPPORTED_TIMEZONES = [
  'Asia/Kathmandu',
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
] as const;

export function getDateKeyInTimezone(isoString: string, timeZone: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

export function getMonthKeyInTimezone(isoString: string, timeZone: string): string {
  const dk = getDateKeyInTimezone(isoString, timeZone);
  return dk ? dk.slice(0, 7) : ''; // YYYY-MM
}

export function getYearKeyInTimezone(isoString: string, timeZone: string): string {
  const dk = getDateKeyInTimezone(isoString, timeZone);
  return dk ? dk.slice(0, 4) : '';
}

export function getHourInTimezone(isoString: string, timeZone: string): number {
  if (!isoString) return 0;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
  }).formatToParts(date);
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const h = parseInt(hourStr, 10);
  return h === 24 ? 0 : h;
}

export function getWeekdayInTimezone(isoString: string, timeZone: string): number {
  // Returns 0 = Sun, 1 = Mon ... 6 = Sat
  const dk = getDateKeyInTimezone(isoString, timeZone);
  if (!dk) return 0;
  const [y, m, d] = dk.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatDateTimeInTimezone(isoString: string, timeZone: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateShortInTimezone(isoString: string, timeZone: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export function getTodayKeyInTimezone(timeZone: string): string {
  return getDateKeyInTimezone(new Date().toISOString(), timeZone);
}

export function getWeekIdFromDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getWeekBoundsFromDateKey(dateKey: string): { weekStart: string; weekEnd: string } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function formatHoldingTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

/**
 * Converts a local datetime string ("YYYY-MM-DDTHH:mm") interpreted in the specified timezone
 * into a UTC ISO string using Intl offset probing.
 */
export function localDateTimeToUtcIso(localDateTime: string, timeZone: string): string {
  if (!localDateTime) return new Date().toISOString();
  const normalized = localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime;
  const [datePart, timePart = '00:00:00'] = normalized.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss = 0] = timePart.split(':').map(Number);

  // Initial UTC guess
  const utcGuess = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
  const probe = new Date(utcGuess);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(probe);

  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  const tzHour = get('hour') === 24 ? 0 : get('hour');
  const tzUtc = Date.UTC(get('year'), get('month') - 1, get('day'), tzHour, get('minute'), get('second'));
  const offsetMs = tzUtc - utcGuess;
  return new Date(utcGuess - offsetMs).toISOString();
}

export function utcIsoToLocalInput(isoString: string, timeZone: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hr = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hr}:${get('minute')}`;
}
