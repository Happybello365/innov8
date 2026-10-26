/**
 * Multi-currency support groundwork.
 *
 * Defines supported currencies with their symbols, locales, decimal places,
 * and exchange rates. This is the single source of truth for currency
 * configuration across the frontend.
 */

export type CurrencyCode = "NGN" | "USD";

export interface CurrencyConfig {
  /** Currency display symbol. */
  symbol: string;
  /** Locale code for number formatting. */
  locale: string;
  /** Number of decimal places for this currency. */
  decimals: number;
  /** Optional exchange rate to base currency (NGN). Only set for non-base currencies. */
  conversionRate?: number;
}

/**
 * Currency registry with metadata for each supported currency.
 *
 * NGN is the base currency (all internal amounts are stored in USDC, displayed as NGN equivalent).
 * USD is the second currency, added behind the multiCurrency feature flag.
 */
export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  NGN: {
    symbol: "₦",
    locale: "en-NG",
    decimals: 2,
  },
  USD: {
    symbol: "$",
    locale: "en-US",
    decimals: 2,
    conversionRate: 1, // Placeholder; would be fetched from external rate API in production
  },
};

/**
 * Get the list of available currencies based on multi-currency feature flag status.
 *
 * @param multiCurrencyEnabled - Whether the multi-currency feature flag is enabled
 * @returns Array of available currency codes
 */
export function getAvailableCurrencies(
  multiCurrencyEnabled: boolean,
): CurrencyCode[] {
  return multiCurrencyEnabled ? ["NGN", "USD"] : ["NGN"];
}

/**
 * Get currency configuration by code.
 *
 * @param code - Currency code (NGN or USD)
 * @returns Currency configuration object
 */
export function getCurrencyConfig(code: CurrencyCode): CurrencyConfig {
  return CURRENCIES[code];
}

/**
 * Check if a currency code is valid and supported.
 *
 * @param code - Potential currency code
 * @returns True if the code is a valid CurrencyCode
 */
export function isSupportedCurrency(code: string): code is CurrencyCode {
  return code in CURRENCIES;
}
