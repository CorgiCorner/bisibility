"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { ChunkedTransferError } from "@/components/settings/migration/useChunkedTransfer";
import { Button } from "@/components/ui/Button";
import type { MigrationImportCompletion } from "@/lib/migration/result";
import { classifyActionError } from "@/lib/ui/action-error";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react/dist/csr/CloudArrowUp";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FileArrowUpIcon as FileArrowUp } from "@phosphor-icons/react/dist/csr/FileArrowUp";
import { FileJsIcon as FileJs } from "@phosphor-icons/react/dist/csr/FileJs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CloudImportPackageFile } from "./cloud-token";
import { type PackageTransferProgress, PackageTransferStatus } from "./PackageTransferStatus";
import { assertPackageFileSize, parsePackageContent, parsePackageUpload } from "./package-content";
import { postImportPackage } from "./package-transfer-helpers";
import { downloadWorkspacePackage } from "./workspace-package-download";

type ExportPackageAction = (input: { projectId: string }) => Promise<CloudImportPackageFile>;
type TransferPackageAction = (input: {
  content: string;
  filename: string;
  projectId: string;
  token: string;
}) => Promise<MigrationImportCompletion>;
type ServerTransferAction = (input: { projectId: string; token: string }) => Promise<{
  completion: MigrationImportCompletion;
  file?: CloudImportPackageFile;
}>;
type PackageTransferPanelProps = {
  disabled?: boolean;
  exportPackageAction: ExportPackageAction;
  missingTokenMessage?: string;
  onExportSuccess?: () => void;
  onStatusRefresh: () => Promise<unknown>;
  onTransferEnd?: () => Promise<void>;
  onTransferStart?: () => boolean | Promise<boolean>;
  onTransferSuccess?: (completion: MigrationImportCompletion) => void;
  packageSource?: "selected" | "server";
  progress?: PackageTransferProgress | null;
  projectId: string;
  rawToken: string | null;
  serverTransferAction?: ServerTransferAction;
  transferPackageAction?: TransferPackageAction;
};
type PackageTranslator = ReturnType<typeof useTranslations<"projectSettingsMigration.package">>;

function errorMessage(
  error: unknown,
  t: PackageTranslator,
  sharedErrors: ReturnType<typeof useSharedErrorMessages>,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
  if (classified.kind === "serverComponentDigest") {
    return sharedErrors.serverComponentDigest({ digest: classified.digest });
  }
  if (error instanceof ChunkedTransferError) {
    return error.reason === "unreachable" ? t("error.unreachable") : t("error.sessionsUnsupported");
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "Package must contain valid JSON.") return t("error.invalidJson");
  if (message === "Package must use the strict v5 transfer format.") {
    return t("error.unsupportedVersion");
  }
  if (message === "Package must contain a strict prj_ v3 project ID.") {
    return t("error.invalidProject");
  }
  if (message === "Upload a JSON export package with at least one keyword.") {
    return t("error.missingKeyword");
  }
  if (message === "Archive is invalid or truncated.") return t("error.archive");
  if (message.includes("maximum") || message.includes("too large")) return t("error.tooLarge");
  return t("error.generic");
}
export function PackageTransferPanel({
  disabled,
  exportPackageAction,
  missingTokenMessage,
  onExportSuccess,
  onStatusRefresh,
  onTransferEnd,
  onTransferStart,
  onTransferSuccess,
  packageSource = "selected",
  progress,
  projectId,
  rawToken,
  serverTransferAction,
  transferPackageAction,
}: Readonly<PackageTransferPanelProps>) {
  const t = useTranslations("projectSettingsMigration.package");
  const sharedErrors = useSharedErrorMessages();
  const [file, setFile] = useState<CloudImportPackageFile | null>(null);
  const [displayedFilename, setDisplayedFilename] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "upload" | "transfer" | null>(null);
  async function handleExport() {
    setBusy("export");
    setMessage(null);
    try {
      const next = await exportPackageAction({ projectId });
      const downloadedFilename = await downloadWorkspacePackage(next);
      setFile(next);
      setDisplayedFilename(downloadedFilename);
      onExportSuccess?.();
      setMessage(t("exported"));
    } catch (error) {
      setMessage(errorMessage(error, t, sharedErrors));
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(upload: File | undefined) {
    if (!upload) return;
    setBusy("upload");
    setMessage(null);
    setFile(null);
    setDisplayedFilename(null);
    try {
      assertPackageFileSize(upload.size);
      const { content, counts } = await parsePackageUpload(
        new Uint8Array(await upload.arrayBuffer()),
      );
      setFile({
        content,
        counts,
        filename: upload.name,
        mimeType: upload.type || "application/json",
      });
      setMessage(t("loaded"));
    } catch (error) {
      setMessage(errorMessage(error, t, sharedErrors));
    } finally {
      setBusy(null);
    }
  }

  async function handleTransfer() {
    if (!rawToken || (!file && packageSource !== "server")) return;
    setBusy("transfer");
    setMessage(null);
    let started = false;
    try {
      const canTransfer = await onTransferStart?.();
      if (canTransfer === false) {
        setMessage(t("error.readOnly"));
        return;
      }
      started = true;
      if (serverExport && serverTransferAction) {
        const result = await serverTransferAction({ projectId, token: rawToken });
        if (result?.file) {
          setFile(result.file);
          setDisplayedFilename(null);
          onExportSuccess?.();
        }
        onTransferSuccess?.(result.completion);
        await onStatusRefresh();
        setMessage(t("complete"));
        return;
      }
      const activeFile = file ?? (await exportPackageAction({ projectId }));
      setFile(activeFile);
      if (!file) {
        setDisplayedFilename(null);
        onExportSuccess?.();
      }
      const { parsed } = parsePackageContent(activeFile.content);
      let completion: MigrationImportCompletion;
      if (transferPackageAction) {
        completion = await transferPackageAction({
          content: activeFile.content,
          filename: activeFile.filename,
          projectId,
          token: rawToken,
        });
      } else {
        completion = await postImportPackage(rawToken, parsed);
      }
      onTransferSuccess?.(completion);
      await onStatusRefresh();
      setMessage(t("complete"));
    } catch (error) {
      setMessage(errorMessage(error, t, sharedErrors));
      await onStatusRefresh().catch(() => undefined);
    } finally {
      setBusy(null);
      if (started) await onTransferEnd?.();
    }
  }

  const hasToken = Boolean(rawToken);
  const isBusy = Boolean(busy) || disabled;
  const serverExport = packageSource === "server";

  return (
    <div className="mt-4.5 overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border border-b p-[16px_20px]">
        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-control bg-blue/15 text-blue-text">
          <FileJs aria-hidden size={20} weight="regular" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{t("title")}</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">
            {serverExport ? t("serverDescription") : t("selectedDescription")}
          </div>
        </div>
      </div>

      <div
        className={serverExport ? "grid gap-3 p-5" : "grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto]"}
      >
        {serverExport ? null : (
          <>
            <Button
              disabled={isBusy}
              loading={busy === "export"}
              loadingLabel={t("exporting")}
              onClick={handleExport}
              size="lg"
              startIcon={<DownloadSimple aria-hidden size={15} weight="regular" />}
              type="button"
              variant="secondary"
            >
              {t("export")}
            </Button>
            <label
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-border-control bg-bg-elev px-3.5 font-medium text-[13px] text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid ${
                isBusy ? "cursor-not-allowed text-fg-muted" : "cursor-pointer"
              }`}
            >
              <FileArrowUp aria-hidden size={15} weight="regular" />
              {busy === "upload" ? t("reading") : t("upload")}
              <input
                accept="application/json,application/zip,.json,.zip"
                className="sr-only"
                disabled={isBusy}
                onChange={(event) => void handleUpload(event.target.files?.[0])}
                type="file"
              />
            </label>
          </>
        )}
        <Button
          disabled={isBusy || !hasToken || (!serverExport && !file)}
          endIcon={<CaretRight aria-hidden size={12} weight="regular" />}
          loading={busy === "transfer"}
          loadingLabel={t("transferring")}
          onClick={handleTransfer}
          size="lg"
          startIcon={<CloudArrowUp aria-hidden size={15} weight="regular" />}
          type="button"
          variant="primary"
        >
          {t("transfer")}
        </Button>
      </div>

      <PackageTransferStatus
        displayedFilename={displayedFilename}
        file={file}
        hasToken={hasToken}
        message={message}
        missingTokenMessage={missingTokenMessage ?? t("missingToken")}
        progress={progress}
      />
    </div>
  );
}
