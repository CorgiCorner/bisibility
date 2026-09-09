"use client";

import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { exportActiveCloudImportPackage } from "@/components/settings/migration/MigrateToCloudExportPackage";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { relativePast } from "@/lib/format/relative-time";
import {
  CLOUD_BACKUP_SECTIONS,
  type CloudBackupCounts,
} from "@/lib/migration/cloud-backup-sections";
import type { CloudPackageExportSummary } from "@/lib/queries/cloud-beta-export";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { CheckSquareIcon as CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useState } from "react";

type CloudBackupModalProps = {
  counts: CloudBackupCounts;
  lastExport: CloudPackageExportSummary | null;
  now: string;
  onClose: () => void;
  onExportSuccess?: (summary: CloudPackageExportSummary) => void;
  open: boolean;
  projectId: string;
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
  projectName,
}: Readonly<CloudBackupModalProps>) {
  const [displayedExport, setDisplayedExport] = useState(lastExport);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setFeedback(null);
    setIsSubmitting(true);
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
        message: actionErrorMessage(error, "Instance import package export failed."),
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
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
          <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">
            Usually under a minute
          </span>
          <Button
            disabled={isSubmitting}
            onClick={onClose}
            style={{ flexShrink: 0 }}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            form="cloud-workspace-backup"
            loading={isSubmitting}
            loadingLabel="Exporting..."
            startIcon={<DownloadSimple aria-hidden size={15} weight="regular" />}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
            type="submit"
          >
            Export package
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      title={
        <span className="block">
          <span className="block">Export project data</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] font-normal tracking-normal text-fg-muted">
            <span>A full copy of {projectName} you can restore into self-host</span>
            <span
              className="inline-flex rounded-full border border-border bg-bg-sunken px-2 py-0.5 text-[9.5px] font-medium leading-none tracking-[0.25px] text-fg-muted"
              data-testid="cloud-backup-export-status"
            >
              {lastExportLabel}
            </span>
          </span>
        </span>
      }
      width={520}
    >
      <form
        className="grid gap-4.5"
        id="cloud-workspace-backup"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <section>
          <div className="text-[10px] uppercase tracking-[0.5px] text-fg-muted">Included</div>
          <div className="mt-2 grid gap-1.5">
            {CLOUD_BACKUP_SECTIONS.map((section) => (
              <div
                className="flex items-center gap-2.5 rounded-control border border-border px-2.5 py-2"
                key={section.label}
              >
                <CheckSquare
                  aria-hidden
                  className="shrink-0 text-accent-text"
                  size={17}
                  weight="regular"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">{section.label}</span>
                  <span className="block text-[10.5px] text-fg-muted">{section.description}</span>
                </span>
                {section.countable ? (
                  <span className="text-[10px] text-fg-muted tabular-nums">
                    {counts[section.countKey].toLocaleString("en-US")}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {feedback ? (
          <p
            className={`m-0 text-[12px] ${feedback.tone === "error" ? "text-red-text" : "text-green-text"}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
