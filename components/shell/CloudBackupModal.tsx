"use client";

import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { exportActiveCloudImportPackage } from "@/components/settings/migration/MigrateToCloudExportPackage";
import { Button, Modal } from "@/components/ui";
import { relativePast } from "@/lib/format/relative-time";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  CLOUD_BACKUP_SECTIONS,
  type CloudBackupCounts,
} from "@/lib/migration/cloud-backup-sections";
import type { CloudPackageExportSummary } from "@/lib/queries/cloud-beta-export";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  CheckSquareIcon as CheckSquare,
  DownloadSimpleIcon as DownloadSimple,
  FileZipIcon as FileZip,
  TableIcon as Table,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { runKeywordCommandFromPalette } from "./keyword-command-actions";

const backupFormatSchema = z.object({
  format: z.enum(["package", "csv"]),
});

type BackupFormatValues = z.infer<typeof backupFormatSchema>;

type CloudBackupModalProps = {
  counts: CloudBackupCounts;
  lastExport: CloudPackageExportSummary | null;
  now: string;
  onClose: () => void;
  onExportSuccess?: (summary: CloudPackageExportSummary) => void;
  open: boolean;
  projectId: string;
  projectRef: string;
  projectName: string;
};

export function CloudBackupModal({
  counts,
  lastExport,
  now,
  onClose,
  onExportSuccess,
  open,
  projectId,
  projectRef,
  projectName,
}: Readonly<CloudBackupModalProps>) {
  const router = useRouter();
  const [displayedExport, setDisplayedExport] = useState(lastExport);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(
    null,
  );
  const {
    formState: { isSubmitting },
    handleSubmit,
    register,
    watch,
  } = useForm<BackupFormatValues>({
    defaultValues: { format: "package" },
    resolver: zodResolver(backupFormatSchema),
  });
  const format = watch("format");

  async function submit(values: BackupFormatValues) {
    setFeedback(null);
    if (values.format === "csv") {
      onClose();
      runKeywordCommandFromPalette(projectRef, "export", router.push);
      return;
    }

    try {
      const file = await exportActiveCloudImportPackage({ projectId });
      await downloadWorkspacePackage(file);
      const summary = {
        exportedAt: new Date().toISOString(),
      };
      setDisplayedExport(summary);
      onExportSuccess?.(summary);
      setFeedback({ message: "Package exported and downloaded.", tone: "success" });
    } catch (error) {
      setFeedback({
        message: actionErrorMessage(error, "Cloud import package export failed."),
        tone: "error",
      });
    }
  }

  const lastExportLabel = displayedExport
    ? `Last export ${relativePast(new Date(displayedExport.exportedAt), new Date(now))}`
    : "Never exported";

  return (
    <Modal
      contentClassName="py-4"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-fg-faint">
            Usually under a minute
          </span>
          <Button
            disabled={isSubmitting}
            onClick={onClose}
            sx={{ flexShrink: 0 }}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            form="cloud-workspace-backup"
            loading={isSubmitting}
            loadingLabel="Exporting..."
            startIcon={<DownloadSimple aria-hidden size={15} weight="bold" />}
            sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
            type="submit"
          >
            {format === "package" ? "Export package" : "Export CSV"}
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      title={
        <span className="block">
          <span className="block">Export workspace data</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] font-normal tracking-normal text-fg-muted">
            <span>A full copy of {projectName} you can restore into self-host</span>
            <span
              className="inline-flex rounded-full border border-border bg-bg-sunken px-2 py-0.5 font-mono text-[9.5px] font-medium leading-none tracking-[0.25px] text-fg-muted"
              data-testid="cloud-backup-export-status"
            >
              {lastExportLabel}
            </span>
          </span>
        </span>
      }
      width={520}
    >
      <form className="grid gap-[18px]" id="cloud-workspace-backup" onSubmit={handleSubmit(submit)}>
        <section>
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            Format
          </div>
          <div aria-label="Export format" className="mt-2 grid gap-2" role="radiogroup">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left outline-none transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-accent ${
                format === "package"
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-bg-elev hover:border-border-strong"
              }`}
            >
              <input className="sr-only" type="radio" value="package" {...register("format")} />
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
                <FileZip aria-hidden size={19} weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="text-[13.5px]">Workspace package</strong>
                  <span className="rounded bg-bg-sunken px-1.5 font-mono text-[10px] text-fg-faint">
                    .zip
                  </span>
                </span>
                <span className="block text-[11.5px] text-fg-muted">
                  Everything below, restores into self-host as-is.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left outline-none transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-accent ${
                format === "csv"
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-bg-elev hover:border-border-strong"
              }`}
            >
              <input className="sr-only" type="radio" value="csv" {...register("format")} />
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-bg-sunken text-fg-muted">
                <Table aria-hidden size={19} weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="text-[13.5px]">Keyword table</strong>
                  <span className="rounded bg-bg-sunken px-1.5 font-mono text-[10px] text-fg-faint">
                    .csv
                  </span>
                </span>
                <span className="block text-[11.5px] text-fg-muted">
                  Current view only - keyword, position, change, volume, URL.
                </span>
              </span>
            </label>
          </div>
        </section>

        <section>
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            Included
          </div>
          <div className="mt-2 grid gap-1.5">
            {CLOUD_BACKUP_SECTIONS.map((section) => (
              <div
                className="flex items-center gap-2.5 rounded-[9px] border border-border px-2.5 py-2"
                key={section.label}
              >
                <CheckSquare aria-hidden className="shrink-0 text-accent" size={17} weight="fill" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">{section.label}</span>
                  <span className="block text-[10.5px] text-fg-muted">{section.description}</span>
                </span>
                {section.countable ? (
                  <span className="font-mono text-[10px] text-fg-faint">
                    {counts[section.countKey].toLocaleString("en-US")}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {feedback ? (
          <p
            className={`m-0 text-[12px] ${feedback.tone === "error" ? "text-red" : "text-green"}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
