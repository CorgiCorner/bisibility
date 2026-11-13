import {
  daysInMonth,
  LIFETIME_MONTHS,
  type MonthlyCostItem,
  priceOnDay,
  roundMinor,
  splitMinor,
} from "@/lib/cost-items/monthly";

function monthIndex(startedOn: string, month: string) {
  const [startYear, startMonth] = startedOn.split("-").map(Number);
  const [year, monthNumber] = month.split("-").map(Number);
  return (year - startYear) * 12 + (monthNumber - startMonth);
}

function partialMonthMinor(item: MonthlyCostItem, month: string, days: readonly string[]) {
  const divisor =
    item.billing === "yearly" ? 12 : item.billing === "lifetime" ? LIFETIME_MONTHS : 1;
  if (item.billing === "lifetime") {
    const index = monthIndex(item.startedOn, month);
    if (index < 0 || index >= LIFETIME_MONTHS) return 0;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  let sum = 0;
  for (const day of days) {
    if (!day.startsWith(`${month}-`)) continue;
    if (day < item.startedOn || (item.endedOn !== null && day > item.endedOn)) continue;
    sum += priceOnDay(item, day);
  }
  return roundMinor(sum, daysInMonth(year, monthNumber) * divisor);
}

function shareOf(total: number, item: MonthlyCostItem, projectId: string) {
  return (
    splitMinor(total, item.split, item.projects).find((part) => part.projectId === projectId)
      ?.minor ?? 0
  );
}

/** This project's share of one cost item across the report days, in the item currency. */
export function periodProjectMinor(
  item: MonthlyCostItem,
  projectId: string,
  days: readonly string[],
) {
  if (item.billing === "one_off") {
    if (
      !days.includes(item.startedOn) ||
      (item.endedOn !== null && item.endedOn < item.startedOn)
    ) {
      return 0;
    }
    return shareOf(priceOnDay(item, item.startedOn), item, projectId);
  }
  const months = [...new Set(days.map((day) => day.slice(0, 7)))];
  return months.reduce(
    (total, month) => total + shareOf(partialMonthMinor(item, month, days), item, projectId),
    0,
  );
}
