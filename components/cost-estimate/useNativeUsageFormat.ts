"use client";

import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import { useLocale, useTranslations } from "next-intl";

export function useNativeUsageFormat() {
  const locale = useLocale();
  const t = useTranslations("shared.nativeUsage");
  function format(estimate: Pick<NativeUsageEstimate, "unit" | "quantity"> | null | undefined) {
    if (!estimate || estimate.quantity === null || estimate.unit === null) return t("unknown");
    if (estimate.unit === "units") return t("operations", { count: estimate.quantity });
    if (estimate.quantity > 0 && estimate.quantity < 1) return t("belowCent");
    return new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(
      estimate.quantity / 100,
    );
  }
  return { format, estimatedLabel: t("estimated"), label: t("usage"), monthly: t("monthly"), t };
}
