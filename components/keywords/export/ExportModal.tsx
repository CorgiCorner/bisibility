"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import {
  type KeywordExportTarget,
  keywordExportTargetLabel,
} from "@/components/keywords/export-target-model";
import { Button, MenuSelect, Modal } from "@/components/ui";
import { exportKeywords } from "@/lib/actions/keyword-import-export";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { downloadBlob } from "@/lib/ui/download";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CheckIcon as Check,
  DownloadSimpleIcon as DownloadSimple,
  LockSimpleIcon as LockSimple,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  columnLabels,
  ExportOptionRow,
  exportColumns,
  exportFormats,
  exportScopes,
  formatOptions,
  scopeOptions,
} from "./ExportModalParts";

const exportSchema = z.object({
  columns: z.record(z.enum(exportColumns), z.boolean()),
  format: z.enum(exportFormats),
  granularity: z.enum(["daily", "weekly"]),
  range: z.enum(["30", "90", "all"]),
  scope: z.enum(exportScopes),
});

type ExportValues = z.infer<typeof exportSchema>;
type ExportFile = Awaited<ReturnType<typeof exportKeywords>>;

type ExportModalProps = {
  onClose: () => void;
  open: boolean;
  projectId?: string;
  target: KeywordExportTarget;
};

const rangeOptions = [
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "All history", value: "all" },
] as const;

const granularityOptions = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
] as const;

const historySelectClass =
  "min-h-9 flex-1 justify-between rounded-lg border-border-strong bg-bg-elev px-3 text-[12.5px] font-normal";

function exportContent(file: ExportFile) {
  if (file.encoding !== "base64") return file.content;
  const binary = atob(file.content);
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
}

function downloadExport(file: ExportFile) {
  downloadBlob(new Blob([exportContent(file)], { type: file.mimeType }), file.filename);
}

export function ExportModal({ onClose, open, projectId, target }: Readonly<ExportModalProps>) {
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    formState: { isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<ExportValues>({
    defaultValues: {
      columns: {
        change: false,
        country: true,
        device: true,
        intent: true,
        tags: true,
        topic: true,
        url: true,
      },
      format: "csv",
      granularity: "daily",
      range: "30",
      scope: "current",
    },
    resolver: zodResolver(exportSchema),
  });
  const values = watch();
  const ctaLabel = `Export ${values.format.toUpperCase()}`;
  const subtitle = keywordExportTargetLabel(target);

  async function submit(formValues: ExportValues) {
    setActionError(null);
    try {
      const file = await exportKeywords({
        ...formValues,
        keywordIds: target.keywordIds,
        projectId,
      });
      downloadExport(file);
      onClose();
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button disabled={isSubmitting} onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            form="export-keywords"
            loading={isSubmitting}
            loadingLabel="Exporting..."
            startIcon={<DownloadSimple size={15} weight="bold" />}
            type="submit"
          >
            {ctaLabel}
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      size="md"
      title={
        <span className="block">
          <span className="block">Export keywords</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {subtitle}
          </span>
        </span>
      }
    >
      <form className="grid gap-[18px]" id="export-keywords" onSubmit={handleSubmit(submit)}>
        <input type="hidden" {...register("range")} />
        <input type="hidden" {...register("granularity")} />
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Format
          </div>
          <div className="mt-[9px] grid gap-[7px]">
            {formatOptions.map((option) => {
              const Icon = option.icon;
              const active = values.format === option.id;
              return (
                <ExportOptionRow
                  active={active}
                  key={option.id}
                  onClick={() => setValue("format", option.id)}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px]"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--${option.tint}) 13%, transparent)`,
                      color: `var(--${option.tint})`,
                    }}
                  >
                    <Icon size={20} weight="fill" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-[7px]">
                      <span className="text-[13.5px] font-semibold text-fg">{option.name}</span>
                      <span className="rounded-[5px] bg-bg-sunken px-1.5 py-px font-mono text-[10px] text-fg-muted">
                        {option.ext}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-fg-muted">{option.desc}</span>
                  </span>
                </ExportOptionRow>
              );
            })}
          </div>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">Data</div>
          <div className="mt-[9px] grid gap-[7px]">
            {scopeOptions.map((option) => {
              const Icon = option.icon;
              const active = values.scope === option.id;
              return (
                <ExportOptionRow
                  active={active}
                  key={option.id}
                  onClick={() => setValue("scope", option.id)}
                >
                  <Icon
                    className={active ? "text-accent-text" : "text-fg-muted"}
                    size={18}
                    weight="bold"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-fg">{option.name}</span>
                    <span className="mt-0.5 block text-[11.5px] text-fg-muted">{option.desc}</span>
                  </span>
                </ExportOptionRow>
              );
            })}
          </div>
          {values.scope === "history" ? (
            <div className="mt-2 flex gap-2">
              <MenuSelect
                ariaLabel="Export range"
                onChange={(value) =>
                  setValue("range", value as ExportValues["range"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                options={rangeOptions}
                triggerClassName={historySelectClass}
                value={values.range}
              />
              <MenuSelect
                ariaLabel="Export granularity"
                onChange={(value) =>
                  setValue("granularity", value as ExportValues["granularity"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                options={granularityOptions}
                triggerClassName={historySelectClass}
                value={values.granularity}
              />
            </div>
          ) : null}
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Columns
          </div>
          <div className="mt-[9px] grid grid-cols-2 gap-[7px]">
            <div className="inline-flex items-center gap-[9px] rounded-[9px] border border-border bg-bg px-2.5 py-2">
              <span className="grid h-[17px] w-[17px] place-items-center rounded-[5px] bg-accent-solid text-primary-contrast">
                <LockSimple size={10} weight="bold" />
              </span>
              <span className="flex-1 text-[12.5px] text-fg">Keyword + Pos</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.4px] text-fg-muted">
                Always
              </span>
            </div>
            {exportColumns.map((column) => {
              const active = values.columns[column];
              return (
                <button
                  className="inline-flex items-center gap-[9px] rounded-[9px] border border-border bg-bg-elev px-2.5 py-2 text-left outline-none hover:border-accent focus-visible:border-accent"
                  key={column}
                  onClick={() => setValue(`columns.${column}`, !active)}
                  type="button"
                >
                  <span
                    className="grid h-[17px] w-[17px] place-items-center rounded-[5px] border-[1.5px]"
                    style={{
                      backgroundColor: active ? "var(--accent)" : "var(--bg-elev)",
                      borderColor: active ? "var(--accent)" : "var(--border-strong)",
                    }}
                  >
                    {active ? <Check className="text-white" size={11} weight="bold" /> : null}
                  </span>
                  <span className="text-[12.5px] text-fg">{columnLabels[column]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-[9px] rounded-[10px] border border-dashed border-border-strong bg-transparent px-[13px] py-[11px]">
          <ArrowsClockwise className="shrink-0 text-accent-text" size={15} />
          <span className="text-[11.5px] leading-[1.45] text-fg-muted">
            CSV and XLSX keep import-friendly columns. JSON includes ranking history for each
            exported keyword.
          </span>
        </div>
        {actionError ? (
          <p className="m-0 font-mono text-[11.5px] text-red-text">{actionError}</p>
        ) : null}
      </form>
    </Modal>
  );
}
