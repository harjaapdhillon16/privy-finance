import * as countryService from 'i18n-iso-countries';
import * as currencyCodes from 'currency-codes';
import enLocale from 'i18n-iso-countries/langs/en.json';

countryService.registerLocale(enLocale as any);

export interface SearchOption {
  value: string;
  label: string;
  description?: string;
  searchText: string;
}

const USD_BRACKETS = [25_000, 50_000, 100_000, 200_000] as const;

// Approximate FX multipliers from USD for range display.
const USD_TO_CURRENCY_RATE: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.35,
  AUD: 1.52,
  NZD: 1.64,
  INR: 83.0,
  JPY: 150.0,
  CNY: 7.2,
  HKD: 7.8,
  SGD: 1.35,
  KRW: 1330,
  AED: 3.67,
  SAR: 3.75,
  CHF: 0.88,
  SEK: 10.5,
  NOK: 10.6,
  DKK: 6.9,
  ZAR: 18.5,
  BRL: 5.0,
  MXN: 17.0,
};

function getRateFromUSD(currency: string) {
  return USD_TO_CURRENCY_RATE[currency.toUpperCase()] || 1;
}

function formatCurrencyValue(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
}

export function getIncomeRangeOptions(currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  const rate = getRateFromUSD(normalizedCurrency);
  const converted = USD_BRACKETS.map((usdValue) => usdValue * rate);

  return [
    `Under ${formatCurrencyValue(converted[0], normalizedCurrency)}`,
    `${formatCurrencyValue(converted[0], normalizedCurrency)} - ${formatCurrencyValue(converted[1], normalizedCurrency)}`,
    `${formatCurrencyValue(converted[1], normalizedCurrency)} - ${formatCurrencyValue(converted[2], normalizedCurrency)}`,
    `${formatCurrencyValue(converted[2], normalizedCurrency)} - ${formatCurrencyValue(converted[3], normalizedCurrency)}`,
    `${formatCurrencyValue(converted[3], normalizedCurrency)}+`,
  ];
}

export function deriveIncomeRangeFromMonthlyEstimate(
  monthlyIncomeEstimate: number,
  currency: string,
) {
  const annualIncome = monthlyIncomeEstimate * 12;
  const rate = getRateFromUSD(currency.toUpperCase());
  const annualIncomeInUsdBaseline = annualIncome / rate;
  const options = getIncomeRangeOptions(currency);

  if (annualIncomeInUsdBaseline < USD_BRACKETS[0]) return options[0];
  if (annualIncomeInUsdBaseline < USD_BRACKETS[1]) return options[1];
  if (annualIncomeInUsdBaseline < USD_BRACKETS[2]) return options[2];
  if (annualIncomeInUsdBaseline < USD_BRACKETS[3]) return options[3];
  return options[4];
}

export const ALL_COUNTRY_OPTIONS: SearchOption[] = Object.entries(
  countryService.getNames('en', { select: 'official' }),
)
  .filter(([code, name]) => Boolean(code && name && code.length === 2))
  .map(([code, name]) => ({
    value: code,
    label: String(name),
    description: code,
    searchText: `${String(name).toLowerCase()} ${code.toLowerCase()}`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const currencyMap = new Map<string, SearchOption>();

for (const entry of currencyCodes.data) {
  if (!entry?.code || !entry?.currency) continue;

  const code = entry.code.toUpperCase();
  if (currencyMap.has(code)) continue;

  currencyMap.set(code, {
    value: code,
    label: code,
    description: entry.currency,
    searchText: `${code.toLowerCase()} ${entry.currency.toLowerCase()}`,
  });
}

export const ALL_CURRENCY_OPTIONS: SearchOption[] = Array.from(currencyMap.values()).sort((a, b) =>
  a.value.localeCompare(b.value),
);
