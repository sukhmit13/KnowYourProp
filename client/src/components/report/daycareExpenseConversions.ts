import { formatNumberInput } from "@/lib/valuation";

export function annualExpenseAtRatio(revenue: number, ratio: number): number | null {
  if (!Number.isFinite(revenue) || revenue < 0 || !Number.isFinite(ratio) || ratio < 0) return null;
  return revenue * ratio / 100;
}

export function ratioForAnnualExpense(expense: number, revenue: number): string | null {
  if (!Number.isFinite(expense) || expense < 0 || !Number.isFinite(revenue) || revenue < 0) return null;
  if (revenue === 0) return expense === 0 ? "0" : null;
  return String(Number((expense / revenue * 100).toFixed(8)));
}

export function formatAnnualExpense(expense: number): string {
  return formatNumberInput(expense.toFixed(2));
}
