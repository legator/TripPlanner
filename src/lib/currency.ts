export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'CHF' | 'PLN' | 'UAH';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  rateAgainstEUR: number; // 1 EUR = X units of currency
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', rateAgainstEUR: 1.0 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', rateAgainstEUR: 1.08 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', rateAgainstEUR: 0.85 },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', rateAgainstEUR: 1.48 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rateAgainstEUR: 1.66 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rateAgainstEUR: 168.5 },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', rateAgainstEUR: 0.96 },
  PLN: { code: 'PLN', symbol: 'zł', name: 'Polish Złoty', rateAgainstEUR: 4.32 },
  UAH: { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', rateAgainstEUR: 45.2 },
};

/**
 * Converts an amount from one currency to another using reference exchange rates.
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;

  const fromRate = SUPPORTED_CURRENCIES[from]?.rateAgainstEUR ?? 1.0;
  const toRate = SUPPORTED_CURRENCIES[to]?.rateAgainstEUR ?? 1.0;

  // Convert to base EUR first, then to target currency
  const eurAmount = amount / fromRate;
  const converted = eurAmount * toRate;

  return Math.round(converted * 100) / 100;
}

/**
 * Formats an amount with currency symbol.
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'EUR',
  decimals: number = 2
): string {
  const info = SUPPORTED_CURRENCIES[currency] || SUPPORTED_CURRENCIES.EUR;
  const rounded = Number(amount.toFixed(decimals));

  if (currency === 'JPY') {
    return `${info.symbol}${Math.round(amount).toLocaleString()}`;
  }

  return `${info.symbol}${rounded.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
