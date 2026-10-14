"use client";
import { ReviewedDefaultsPanel } from "@/components/settings/tracking/ReviewedDefaultsPanel";
import type { useReviewedDefaults } from "@/components/settings/tracking/use-reviewed-defaults";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
export function OnboardingDefaultsReview({
  reviewed,
  onConfirm,
  active,
}: Readonly<{
  active: boolean;
  reviewed: ReturnType<typeof useReviewedDefaults>;
  onConfirm: () => void;
}>) {
  const t = useTranslations("shared.reviewedDefaults");
  if (!active || !reviewed.quote) return null;
  return (
    <div className="mb-4">
      <ReviewedDefaultsPanel
        quote={reviewed.quote}
        acknowledged={reviewed.acknowledged}
        onAcknowledged={reviewed.setAcknowledged}
        locked={reviewed.locked}
      />
      <Button
        variant="outline"
        disabled={reviewed.pending || (!reviewed.acknowledged && !reviewed.locked)}
        onClick={onConfirm}
      >
        {t(reviewed.locked ? "retry" : "confirmSave")}
      </Button>
    </div>
  );
}
