"use client";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
export function TrackingBulkActions({
  count,
  pending,
  onAction,
}: Readonly<{
  count: number;
  pending: boolean;
  onAction: (action: "pause" | "resume" | "archive") => void;
}>) {
  const t = useTranslations("projectAiTracking");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-bg-elev p-3">
      <p className="text-sm">{t("selectedPrompts", { count })}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => onAction("pause")}>
          {t("pause")}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => onAction("resume")}>
          {t("resume")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => onAction("archive")}
        >
          {t("archive")}
        </Button>
      </div>
    </div>
  );
}
