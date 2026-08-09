"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { Button } from "@/components/ui";
import { exportCloudImportPackage } from "@/lib/actions/cloud";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  DownloadSimpleIcon as DownloadSimple,
  FileArrowDownIcon as FileArrowDown,
  ShieldWarningIcon as ShieldWarning,
} from "@phosphor-icons/react";
import { useState } from "react";

type ExportPackageCardProps = {
  onExportSuccess?: () => void;
  projectId?: string;
  successMessage?: string;
};

export function exportActiveCloudImportPackage(input: { projectId: string }) {
  return exportCloudImportPackage({ projectId: input.projectId });
}

function errorMessage(error: unknown) {
  return actionErrorMessage(error, "Instance import package export failed.");
}

export function ExportPackageCard({
  onExportSuccess,
  projectId,
  successMessage = "Package exported and downloaded.",
}: Readonly<ExportPackageCardProps>) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<CloudImportPackageFile | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    if (!projectId) {
      setMessage("Choose a project before exporting a package.");
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
      setMessage(successMessage);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="bg-bg-sunken px-[15px] py-2.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Instance import package
        </div>
        <div className="flex items-center gap-3 border-border-soft border-t px-[15px] py-[13px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[9px] bg-bg-sunken text-accent-text">
            <FileArrowDown aria-hidden size={18} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              {downloadedFilename ?? file?.filename ?? "No package exported yet"}
            </div>
            <div className="font-mono text-[11px] text-fg-muted">
              {file
                ? `${file.counts.keywords} keywords / ${file.counts.rankChecks} rank checks`
                : "Generated from the active project"}
            </div>
          </div>
          <Button
            loading={busy}
            loadingLabel="Exporting..."
            onClick={handleExport}
            startIcon={<DownloadSimple aria-hidden size={14} weight="bold" />}
            type="button"
            variant="primary"
          >
            Export
          </Button>
        </div>
      </div>
      {message ? <p className="m-0 mt-2.5 text-[12px] text-fg-muted">{message}</p> : null}
    </>
  );
}

export function ExportSecurityNote() {
  return (
    <div className="mt-3.5 flex items-start gap-2.5 rounded-[11px] border border-accent bg-accent-soft px-[15px] py-[13px] text-[12.5px] leading-5 text-fg">
      <span className="flex h-5 shrink-0 items-center">
        <ShieldWarning aria-hidden className="text-accent-text" size={17} weight="fill" />
      </span>
      <span>
        <strong className="font-semibold">Not included:</strong> provider API keys, analytics tokens
        and user passwords. For security these never leave your instance; re-connect providers once
        in the hosted service.
      </span>
    </div>
  );
}
