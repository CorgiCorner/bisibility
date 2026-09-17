"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { Button } from "@/components/ui/Button";
import { exportCloudImportPackage } from "@/lib/actions/cloud";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FileArrowDownIcon as FileArrowDown } from "@phosphor-icons/react/dist/csr/FileArrowDown";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/csr/ShieldWarning";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ExportPackageCardProps = {
  onExportSuccess?: () => void;
  projectId?: string;
  successMessage?: string;
};

export function exportActiveCloudImportPackage(input: { projectId: string }) {
  return exportCloudImportPackage({ projectId: input.projectId });
}

export function ExportPackageCard({
  onExportSuccess,
  projectId,
  successMessage,
}: Readonly<ExportPackageCardProps>) {
  const t = useTranslations("projectSettingsMigration.export");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<CloudImportPackageFile | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    if (!projectId) {
      setMessage(t("chooseProject"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await exportActiveCloudImportPackage({ projectId });
      const filename = await downloadWorkspacePackage(next);
      setFile(next);
      setDownloadedFilename(filename);
      onExportSuccess?.();
      setMessage(successMessage ?? t("success"));
    } catch {
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-card border border-border">
        <div className="bg-bg-sunken px-[15px] py-2.5 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("title")}
        </div>
        <div className="flex items-center gap-3 border-border border-t px-[15px] py-[13px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-bg-sunken text-accent-text">
            <FileArrowDown aria-hidden size={18} weight="regular" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              {downloadedFilename ?? file?.filename ?? t("empty")}
            </div>
            <div className="font-sans tabular-nums text-[11px] text-fg-muted">
              {file
                ? t("counts", {
                    keywords: file.counts.keywords,
                    rankChecks: file.counts.rankChecks,
                  })
                : t("generated")}
            </div>
          </div>
          <Button
            loading={busy}
            loadingLabel={t("exporting")}
            onClick={handleExport}
            startIcon={<DownloadSimple aria-hidden size={14} weight="regular" />}
            type="button"
            variant="primary"
          >
            {t("export")}
          </Button>
        </div>
      </div>
      {message ? <p className="m-0 mt-2.5 text-[12px] text-fg-muted">{message}</p> : null}
    </>
  );
}

export function ExportSecurityNote() {
  const t = useTranslations("projectSettingsMigration.export");
  return (
    <div className="mt-3.5 flex items-start gap-2.5 rounded-control border border-accent bg-accent-soft px-[15px] py-[13px] text-[12.5px] leading-5 text-fg">
      <span className="flex h-5 shrink-0 items-center">
        <ShieldWarning aria-hidden className="text-accent-text" size={17} weight="regular" />
      </span>
      <span>
        <strong className="font-semibold">{t("notIncluded")}</strong> {t("security")}
      </span>
    </div>
  );
}
