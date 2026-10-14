"use client";
import { ReviewedDefaultsPanel } from "@/components/settings/tracking/ReviewedDefaultsPanel";
import type { useReviewedDefaults } from "@/components/settings/tracking/use-reviewed-defaults";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
export function OnboardingDefaultsReview({
  reviewed,
  onConfirm,
  active,
  error,
}: Readonly<{
  active: boolean;
  error: string | null;
  reviewed: ReturnType<typeof useReviewedDefaults>;
  onConfirm: () => void;
}>) {
  const t = useTranslations("shared.reviewedDefaults");
  if (!active || (!reviewed.quote && !error)) return null;
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
        disabled={
          reviewed.pending || Boolean(reviewed.quote && !reviewed.acknowledged && !reviewed.locked)
        }
        onClick={onConfirm}
      >
        {t(reviewed.locked ? "retry" : reviewed.quote ? "confirmSave" : "review")}
      </Button>
      {error ? (
        <p className="m-0 mt-3 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
