"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useState } from "react";

export type BackupExportAction = (input: { projectId: string }) => Promise<CloudImportPackageFile>;

type BackupExportCardProps = {
  exportBackup?: BackupExportAction;
  projectId: string;
};

export function BackupExportCard({ exportBackup, projectId }: Readonly<BackupExportCardProps>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  async function handleExport() {
    if (!exportBackup) return;
    setBusy(true);
    setError(null);
    try {
      const packageFile = await exportBackup({ projectId });
      await downloadWorkspacePackage(packageFile);
      showToast("Project data exported.", { severity: "success" });
    } catch (error) {
      setError(actionErrorMessage(error, "Project data could not be exported."));
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
            startIcon={<DownloadSimple aria-hidden size={14} weight="regular" />}
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
      <div className="rounded-control border border-border bg-bg-sunken px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-fg">Project package</div>
          <div className="mt-0.5 text-[11.5px] text-fg-muted">
            Keywords, retained history, tags, competitors, alerts, saved views and notification
            preferences.
          </div>
        </div>
      </div>
      {error ? (
        <p className="m-0 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </AdvancedCardFrame>
  );
}
