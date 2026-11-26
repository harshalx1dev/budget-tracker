import { daysBetween } from "./dates";

/** Accounts that hold savings or investments. They count toward net worth and never toward safe-to-spend. */
export const ASSET_TYPES = ["savings", "fd", "mutual_fund", "stocks", "retirement", "gold", "other_asset"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const isAssetType = (t: string): t is AssetType => (ASSET_TYPES as readonly string[]).includes(t);

export const TYPE_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank", card: "Card", wallet: "Wallet or UPI",
  savings: "Savings account", fd: "Fixed deposit", mutual_fund: "Mutual funds", stocks: "Stocks",
  retirement: "PPF, NPS or EPF", gold: "Gold", other_asset: "Other investment",
};

/**
 * What a fixed deposit has grown to on `onDate`, compounding quarterly (the usual bank method), stopping at maturity.
 * An estimate: banks round and sometimes pay simple interest, which is why the stated maturity value is stored too.
 */
export function fdValue(principalMinor: number, annualRatePct: number, startOn: string, onDate: string, maturityOn: string) {
  const end = onDate > maturityOn ? maturityOn : onDate;
  const days = Math.max(0, daysBetween(startOn, end));
  const years = days / 365;
  return Math.round(principalMinor * (1 + annualRatePct / 400) ** (4 * years));
}

export const fdMaturityEstimate = (principalMinor: number, annualRatePct: number, startOn: string, maturityOn: string) =>
  fdValue(principalMinor, annualRatePct, startOn, maturityOn, maturityOn);

/** The emergency fund against its target: months of essential spending held in the linked account. */
export function emergencyStatus(i: { essentialMonthlyMinor: number; months: number; currentMinor: number }) {
  const target = i.essentialMonthlyMinor * i.months;
  const covered = i.essentialMonthlyMinor > 0 ? Math.round((i.currentMinor / i.essentialMonthlyMinor) * 10) / 10 : null;
  return {
    targetMinor: target,
    coveredMonths: covered,
    shortfallMinor: Math.max(0, target - i.currentMinor),
    pct: target > 0 ? Math.max(0, Math.min(100, Math.round((i.currentMinor / target) * 100))) : 0,
    known: i.essentialMonthlyMinor > 0,
  };
}

/** Share of income put into savings and investments, or null when there was no income to compare with. */
export const savingsRate = (savedMinor: number, incomeMinor: number) => (incomeMinor > 0 ? Math.round((savedMinor / incomeMinor) * 100) : null);

export const netWorth = (p: { liquidMinor: number; assetsMinor: number; liabilitiesMinor: number }) => p.liquidMinor + p.assetsMinor - p.liabilitiesMinor;
