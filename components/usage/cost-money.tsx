"use client";

import { minorDigits } from "@/lib/cost-items/money";
import { useFormatter } from "next-intl";

export function useMinorMoney() {
  const format = useFormatter();
  return (currency: string, minor: number) => {
    const digits = minorDigits(currency);
    return format.number(minor / 10 ** digits, {
      currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
      style: "currency",
    });
  };
}

export function useCostDate() {
  const format = useFormatter();
  return (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
}
