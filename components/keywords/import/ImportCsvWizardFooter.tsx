import { Button } from "@/components/ui";
import { ArrowLeftIcon as ArrowLeft, ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";

type ImportCsvWizardFooterProps = {
  canImport: boolean;
  confirmImport: () => Promise<void>;
  isSubmitting: boolean;
  next: () => Promise<void>;
  primaryLabel: string;
  setStep: (updater: (value: number) => number) => void;
  step: number;
};

export function ImportCsvWizardFooter({
  canImport,
  confirmImport,
  isSubmitting,
  next,
  primaryLabel,
  setStep,
  step,
}: Readonly<ImportCsvWizardFooterProps>) {
  return (
    <div className="flex items-center gap-2.5">
      {step > 1 && step < 5 ? (
        <Button
          disabled={isSubmitting}
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          startIcon={<ArrowLeft size={14} weight="bold" />}
          type="button"
          variant="secondary"
        >
          Back
        </Button>
      ) : null}
      {step === 4 ? (
        <Button
          disabled={isSubmitting || !canImport}
          endIcon={<ArrowRight size={14} weight="bold" />}
          key="review-confirmation"
          onClick={() => void confirmImport()}
          sx={{ flex: 1 }}
          type="button"
        >
          {isSubmitting ? "Importing..." : primaryLabel}
        </Button>
      ) : (
        <Button
          disabled={isSubmitting}
          endIcon={<ArrowRight size={14} weight="bold" />}
          key="step-navigation"
          onClick={() => void next()}
          sx={{ flex: 1 }}
          type="button"
        >
          {isSubmitting ? "Importing..." : primaryLabel}
        </Button>
      )}
    </div>
  );
}
