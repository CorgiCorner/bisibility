import { Button } from "@/components/ui";
import { ArrowLeftIcon as ArrowLeft, ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";

type ImportCsvWizardFooterProps = {
  canImport: boolean;
  confirmImport: () => Promise<void>;
  isReviewing: boolean;
  isSubmitting: boolean;
  next: () => Promise<void>;
  startOver: () => void;
  setStep: (updater: (value: number) => number) => void;
  step: number;
};

export function ImportCsvWizardFooter({
  canImport,
  confirmImport,
  isReviewing,
  isSubmitting,
  next,
  startOver,
  setStep,
  step,
}: Readonly<ImportCsvWizardFooterProps>) {
  if (step === 5) {
    return (
      <div className="flex items-center gap-2.5">
        <Button disabled={isSubmitting} onClick={startOver} type="button" variant="secondary">
          Start over
        </Button>
        <Button disabled={isSubmitting} onClick={() => void next()} sx={{ flex: 1 }} type="button">
          Done
        </Button>
      </div>
    );
  }
  const primaryLabel = step === 4 ? "Import keywords" : "Continue";
  return (
    <div className="flex items-center gap-2.5">
      {step > 1 && step < 5 ? (
        <Button
          disabled={isSubmitting || isReviewing}
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          startIcon={<ArrowLeft size={14} weight="regular" />}
          type="button"
          variant="secondary"
        >
          Back
        </Button>
      ) : null}
      {step === 4 ? (
        <Button
          disabled={isSubmitting || isReviewing || !canImport}
          key="review-confirmation"
          onClick={() => void confirmImport()}
          sx={{ flex: 1 }}
          type="button"
        >
          {isSubmitting ? "Importing..." : primaryLabel}
        </Button>
      ) : (
        <Button
          disabled={isSubmitting || isReviewing || (step === 3 && !canImport)}
          endIcon={<ArrowRight size={14} weight="regular" />}
          key="step-navigation"
          onClick={() => void next()}
          sx={{ flex: 1 }}
          type="button"
        >
          {isReviewing ? "Checking..." : isSubmitting ? "Importing..." : primaryLabel}
        </Button>
      )}
    </div>
  );
}
