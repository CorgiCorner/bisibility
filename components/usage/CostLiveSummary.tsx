"use client";

import type { CostFormValues } from "@/lib/cost-items/input";
import { toCostItemInput } from "@/lib/cost-items/input";
import { buildPriceChanges, scheduleSegments } from "@/lib/cost-items/schedule";
import { useTranslations } from "next-intl";
import { useCostDate, useMinorMoney } from "./cost-money";

export function CostLiveSummary({
  projectPublicId,
  values,
}: Readonly<{ projectPublicId: string; values: CostFormValues }>) {
  const t = useTranslations("projectUsageCosts.drawer");
  const money = useMinorMoney();
  const date = useCostDate();
  const input = toCostItemInput(values, projectPublicId);
  if (typeof input === "string") return <p className="text-sm text-fg-muted">{t("footnote")}</p>;
  const changes = buildPriceChanges({
    amountMinor: input.amountMinor,
    discount: input.discount,
    startedOn: input.startedOn,
    trialUntil: input.trialUntil,
  });
  const segments = scheduleSegments(input.amountMinor, input.startedOn, changes);
  const sentence = segments
    .map((segment) => {
      const amount = money(input.currency, segment.amountMinor);
      if (!segment.until) {
        return input.billing === "one_off" ? amount : `${amount} ${t("aMonth")}`;
      }
      if (segment.amountMinor > 0 && input.billing !== "one_off") {
        return `${amount} ${t("aMonth")} ${t("until")} ${date(segment.until)}`;
      }
      return `${amount} ${t("until")} ${date(segment.until)}`;
    })
    .join(`, ${t("then")} `);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>{sentence}</p>
      <p className="text-fg-muted">{t("footnote")}</p>
    </div>
  );
}
