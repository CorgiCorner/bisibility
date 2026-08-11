"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { Button, StatusPill } from "@/components/ui";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";

export type BackupExportAction = (input: { projectId: string }) => Promise<CloudImportPackageFile>;

type BackupExportCardProps = {
  exportBackup?: BackupExportAction;
  projectId: string;
};

export function BackupExportCard({ exportBackup, projectId }: Readonly<BackupExportCardProps>) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleExport() {
    if (!exportBackup) return;
    setBusy(true);
    setFeedback(null);
    try {
      const packageFile = await exportBackup({ projectId });
      await downloadWorkspacePackage(packageFile);
      setFeedback("Project data exported. Project writes were not changed.");
    } catch (error) {
      setFeedback(actionErrorMessage(error, "Project data could not be exported."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdvancedCardFrame
      className={advancedCardGeometryClassNames.backup}
      description="Download the supported project data in this package without starting a migration or changing project access."
      footer={
        exportBackup ? (
          <Button
            loading={busy}
            loadingLabel="Exporting..."
            onClick={handleExport}
            size="sm"
            startIcon={<DownloadSimple aria-hidden size={14} weight="bold" />}
            type="button"
            variant="secondary"
          >
            Download data export
          </Button>
        ) : null
      }
      id="backup"
      title="Export project data"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-fg">Project package</div>
          <div className="mt-0.5 text-[11.5px] text-fg-muted">
            Keywords, retained history, tags, competitors, alerts, saved views and notification
            preferences.
          </div>
        </div>
        <StatusPill label="Writes stay active" showDot={false} size="sm" status="optional" />
      </div>
      {feedback ? (
        <p aria-live="polite" className="m-0 text-[12px] text-fg-muted">
          {feedback}
        </p>
      ) : null}
    </AdvancedCardFrame>
  );
}
