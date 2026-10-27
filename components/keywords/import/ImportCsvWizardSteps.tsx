import { Button } from "@/components/ui/Button";
import {
  keywordImportTemplateColumns,
  keywordImportTemplateCsv,
} from "@/lib/keywords/import-csv-template";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";

export { DoneStep } from "./ImportCsvWizardDoneStep";

export function ImportStepper({ step }: Readonly<{ step: number }>) {
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard.steps");
  const steps = [t("template"), t("upload"), t("map"), t("review"), t("done")];
  return (
    <div className="mt-4.5 flex items-center">
      {steps.map((label, index) => {
        const number = index + 1;
        const current = number === step;
        const completed = number < step;
        return (
          <div className="flex min-w-0 flex-1 items-center" key={label}>
            <span className="flex w-[54px] shrink-0 flex-col items-center gap-1.5">
              <span
                className="grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] font-sans tabular-nums text-[11px] font-semibold"
                style={{
                  backgroundColor: current
                    ? "var(--accent-solid)"
                    : completed
                      ? "var(--accent-soft)"
                      : "var(--bg-sunken)",
                  borderColor: current ? "var(--accent-solid)" : "transparent",
                  color: current
                    ? "var(--accent-on-solid)"
                    : completed
                      ? "var(--accent-text)"
                      : "var(--fg-muted)",
                }}
              >
                {completed ? <Check aria-hidden size={15} weight="regular" /> : number}
              </span>
              <span
                className="whitespace-nowrap text-[10px] font-normal"
                style={{ color: number === step ? "var(--fg)" : "var(--fg-muted)" }}
              >
                {label}
              </span>
            </span>
            {number < steps.length ? (
              <span
                className="mb-5 h-0.5 flex-1 rounded-full"
                style={{ backgroundColor: number < step ? "var(--accent)" : "var(--border)" }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TemplateStep() {
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Start from the template</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        Download the CSV template, fill in your keywords, then upload it on the next step. Only{" "}
        <code className="font-mono text-[12px] text-accent-text">keyword</code> is required.
      </p>
      <Button
        size="lg"
        startIcon={<DownloadSimple size={16} weight="regular" />}
        style={{ marginTop: "16px" }}
        type="button"
        variant="primary"
      >
        Download template.csv
      </Button>
      <div className="mt-4.5 overflow-hidden rounded-control border border-border">
        <div className="flex items-center justify-between bg-code-bg px-[13px] py-2 font-sans tabular-nums text-[10.5px] text-code-faint">
          <span>template.csv</span>
          <span className="text-green-text">UTF-8</span>
        </div>
        <pre className="m-0 overflow-x-auto bg-code-bg px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.75] text-code-fg">
          {keywordImportTemplateCsv}
        </pre>
      </div>
      <div className="mt-4.5 flex flex-wrap gap-1.5">
        {keywordImportTemplateColumns.map((column) => {
          const item = column === "keyword" ? "keyword*" : column;
          return (
            <span
              className="rounded-control bg-bg-sunken px-[9px] py-[3px] font-sans tabular-nums text-[11px] text-fg-muted first:bg-accent-soft first:font-semibold first:text-accent-text"
              key={item}
            >
              {item}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-[7px] text-[12px] text-fg-muted">
        <Info weight="regular" size={14} />
        Blank columns are ignored. Tags are semicolon-separated.
      </div>
    </div>
  );
}
