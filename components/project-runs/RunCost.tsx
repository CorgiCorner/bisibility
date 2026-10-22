"use client";
import type { ProjectRunCost } from "@/lib/runs/project-run";
import { useFormatter, useTranslations } from "next-intl";

export function RunCost({ cost }: Readonly<{ cost: ProjectRunCost }>) {
  const t = useTranslations("projectRuns.table");
  const format = useFormatter();
  if (cost.state === "not_applicable") return null;
  const amount =
    cost.actualCents === null
      ? t("costUnknown")
      : format.number(cost.actualCents / 100, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        });
  return (
    <span className="text-[11px] tabular-nums text-fg-muted">
      {cost.state === "partial"
        ? t("knownCost", { cost: amount })
        : cost.state === "unknown"
          ? t("costUnknown")
          : t("actualCost", { cost: amount })}
    </span>
  );
}
