"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";

type AddKeywordDrawerFooterProps = {
  ctaLabel: string;
  isReviewMode: boolean;
  isSubmitting: boolean;
  onReview: () => void;
  submitDisabled: boolean;
};

export function AddKeywordDrawerFooter({
  ctaLabel,
  isReviewMode,
  isSubmitting,
  onReview,
  submitDisabled,
}: Readonly<AddKeywordDrawerFooterProps>) {
  const { readOnly } = useProjectWriteMode();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <ProjectReadOnlyTooltip className="inline-flex flex-1 whitespace-nowrap">
          <Button
            disabled={readOnly || submitDisabled}
            form={isReviewMode ? undefined : "add-keyword-form"}
            onClick={isReviewMode ? onReview : undefined}
            style={{ flex: 1 }}
            type={isReviewMode ? "button" : "submit"}
          >
            {isSubmitting ? "Adding..." : ctaLabel}
          </Button>
        </ProjectReadOnlyTooltip>
      </div>
    </div>
  );
}
