import { Sheet } from "@/components/ui/Sheet";
import type { KeywordImportMarketContext } from "@/lib/keywords/import-market-context";
import type { ReactNode } from "react";
import { ImportStepper } from "./ImportCsvWizardSteps";
import { ImportMarketSelection } from "./ImportMarketSelection";

export function ImportCsvWizardFrame({
  children,
  footer,
  marketContext,
  onClose,
  onMarketChange,
  open,
  pending,
  projectId,
  selectedMarketKey,
  step,
}: Readonly<{
  children: ReactNode;
  footer: ReactNode;
  marketContext?: KeywordImportMarketContext;
  onClose: () => void;
  onMarketChange: (key: string | null) => void;
  open: boolean;
  pending: boolean;
  projectId?: string;
  selectedMarketKey: string | null;
  step: number;
}>) {
  return (
    <Sheet
      footer={footer}
      onClose={onClose}
      open={open}
      title={
        <span className="block">
          <span className="block">Import keywords</span>
          <span className="mt-1 block text-[13px] font-normal tracking-normal text-fg-muted">
            Bulk-add keywords from CSV or XLSX.
          </span>
          <ImportStepper step={step} />
        </span>
      }
      widthVariant="form"
    >
      {marketContext && step < 5 ? (
        <ImportMarketSelection
          context={marketContext}
          disabled={pending}
          onChange={onMarketChange}
          projectId={projectId}
          value={selectedMarketKey}
        />
      ) : null}
      <form onSubmit={(event) => event.preventDefault()}>{children}</form>
    </Sheet>
  );
}
