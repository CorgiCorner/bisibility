import {
  createUsageNumberFormat,
  isMoneyUnit,
  type UsagePresentationFigure,
  type UsagePresentationOptions,
} from "@/components/metering/usage-number-format";
import { usageCapFromBudget } from "@/components/usagekit/usage-cap-pill";
import type { BudgetRow } from "@usagekit/views";
import { parseProviderDecimal } from "@usagekit/views";

const rank = { ok: 0, warning: 1, exceeded: 2 };

/** Compare independent bounds; amounts with different units are never added. */
export function headerBudgetSummary(rows: readonly BudgetRow[]) {
  const visible = rows.filter((row) => !row.redacted && row.level !== "unavailable");
  const projections = visible.map((row) => usageCapFromBudget(row));
  const level = projections.reduce<"ok" | "warning" | "exceeded">(
    (worst, value) => (rank[value.level ?? "ok"] > rank[worst] ? (value.level ?? "ok") : worst),
    "ok",
  );
  const selected = projections
    .filter((value) => value.percent !== null && value.level === level)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
  const partial =
    rows.length !== visible.length ||
    visible.some(
      (row, index) =>
        projections[index]?.partial ||
        (row.used !== "unavailable" && row.used.certainty === "estimated") ||
        [row.used, row.reserved].some(
          (value) =>
            value === "unavailable" ||
            value.certainty === "unknown" ||
            parseProviderDecimal(value.text, value.unit).outcome !== "valid",
        ) ||
        (projections[index]?.percent === null && row.limit !== "unlimited"),
    );
  return {
    unavailable: visible.length === 0,
    unlimited: visible.length > 0 && !partial && visible.every((row) => row.limit === "unlimited"),
    percent: selected?.percent ?? null,
    level,
    partial,
  };
}

/** Shift exact cents to dollars before locale formatting, without a float conversion. */
export function headerBudgetFigure(
  value: UsagePresentationFigure,
  locale: string,
  options: UsagePresentationOptions = {},
) {
  if (!isMoneyUnit(value.unit) || options.moneyDisplay === "raw-unit") return null;
  const parsed = parseProviderDecimal(value.text, value.unit);
  if (parsed.outcome !== "valid") return null;
  return createUsageNumberFormat(locale, options).figure(value);
}
