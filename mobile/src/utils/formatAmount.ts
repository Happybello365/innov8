// Keep the default locale and precision aligned with frontend/src/lib/i18n/format.ts.
const LOCALE = 'en-NG';
const MISSING = '—';
const STELLAR_ASSETS = new Set(['XLM', 'NATIVE']);

function parseAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  const normalized = value.trim();
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    return NaN;
  }
  return Number(normalized.replace(/,/g, ''));
}

export function formatAmount(value: string | number, asset: string): string {
  const number = parseAmount(value);
  if (!Number.isFinite(number)) return typeof value === 'number' || !value.trim() ? MISSING : value;
  const code = asset.toUpperCase();
  if (code === 'NGN') {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'NGN' }).format(number);
  }
  const stellar = STELLAR_ASSETS.has(code);
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: stellar ? 0 : 2,
    maximumFractionDigits: stellar ? 7 : 2,
  }).format(number);
}

export function formatQuantity(value: string | number, unit?: string): string {
  const number = parseAmount(value);
  if (!Number.isFinite(number)) return MISSING;
  const amount = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 7 }).format(number);
  return unit ? `${amount} ${unit}` : amount;
}

export function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return MISSING;
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}
