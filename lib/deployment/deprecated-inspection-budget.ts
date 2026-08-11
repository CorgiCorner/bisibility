export const DEPRECATED_INSPECTION_DAILY_BUDGET_WARNING =
  "BISIBILITY_GSC_INSPECTION_DAILY_BUDGET is no longer read - set the daily limit per project in Settings > URL inspection.";

let warned = false;

export function warnDeprecatedInspectionDailyBudget(env = process.env) {
  if (warned || env.BISIBILITY_GSC_INSPECTION_DAILY_BUDGET === undefined) return;
  warned = true;
  console.warn(DEPRECATED_INSPECTION_DAILY_BUDGET_WARNING);
}
