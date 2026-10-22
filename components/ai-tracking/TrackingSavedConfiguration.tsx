"use client";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { TrackingRunDrawerProps } from "./TrackingRunDrawer.types";

export function TrackingSavedConfiguration({
  schedule,
  count,
  onReview,
}: {
  schedule: NonNullable<TrackingRunDrawerProps["schedule"]>;
  count: number;
  onReview: () => void;
}) {
  const t = useTranslations("projectAiTracking");
  return (
    <div className="rounded-card border border-border p-4 text-xs leading-5">
      <p>{t("savedConfigurationReview", { count: schedule.promptIds?.length ?? count })}</p>
      {schedule.configurations?.map((configuration, index) => (
        <p key={index} className="mt-2">
          {configuration.source} · {configuration.engine} · {configuration.model ?? t("unknown")} ·{" "}
          {String(configuration.parameters.language_code ?? t("unknown"))} ·{" "}
          {String(configuration.parameters.location_name ?? t("unknown"))}
        </p>
      ))}
      <Button className="mt-3" size="sm" variant="secondary" onClick={onReview}>
        {t("reviewReplacementConfiguration")}
      </Button>
    </div>
  );
}
