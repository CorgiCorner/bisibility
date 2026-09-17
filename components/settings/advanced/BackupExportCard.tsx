"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { classifyActionError } from "@/lib/ui/action-error";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type BackupExportAction = (input: { projectId: string }) => Promise<CloudImportPackageFile>;

type BackupExportCardProps = {
  exportBackup?: BackupExportAction;
  projectId: string;
};

function backupExportError(
  error: unknown,
  t: ReturnType<typeof useTranslations<"projectSettingsAdvanced.backup">>,
  sharedErrors: ReturnType<typeof useSharedErrorMessages>,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
  if (classified.kind === "serverComponentDigest") {
    return sharedErrors.serverComponentDigest({ digest: classified.digest });
  }
  return t("error");
}

export function BackupExportCard({ exportBackup, projectId }: Readonly<BackupExportCardProps>) {
  const t = useTranslations("projectSettingsAdvanced.backup");
  const sharedErrors = useSharedErrorMessages();
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
      showToast(t("success"), { severity: "success" });
    } catch (error) {
      setError(backupExportError(error, t, sharedErrors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdvancedCardFrame
      className={advancedCardGeometryClassNames.backup}
      description={t("description")}
      footer={
        exportBackup ? (
          <Button
            loading={busy}
            loadingLabel={t("exporting")}
            onClick={handleExport}
            size="sm"
            startIcon={<DownloadSimple aria-hidden size={14} weight="regular" />}
            type="button"
            variant="secondary"
          >
            {t("download")}
          </Button>
        ) : null
      }
      id="backup"
      title={t("title")}
    >
      <div className="rounded-control border border-border bg-bg-sunken px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-fg">{t("packageTitle")}</div>
          <div className="mt-0.5 text-[11.5px] text-fg-muted">{t("packageDescription")}</div>
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
