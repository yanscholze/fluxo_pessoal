export const SUPPORTED_ACCOUNT_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS", "CAD", "JPY", "CHF"] as const;

export type AccountCurrency = typeof SUPPORTED_ACCOUNT_CURRENCIES[number];

export function normalizeAccountCurrency(value: unknown): AccountCurrency {
  const code = String(value ?? "BRL").trim().toUpperCase();
  return (SUPPORTED_ACCOUNT_CURRENCIES as readonly string[]).includes(code) ? code as AccountCurrency : "BRL";
}

export function formatAccountMoney(value: number, currency: unknown, locale = "pt-BR") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizeAccountCurrency(currency),
  }).format(value);
}
