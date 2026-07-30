"use client";

import type { MigrationImportCompletion } from "@/lib/migration/result";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowRightIcon as ArrowRight,
  CheckCircleIcon as CheckCircle,
  CloudArrowUpIcon as CloudArrowUp,
  DownloadSimpleIcon as DownloadSimple,
  FileArrowUpIcon as FileArrowUp,
  FileJsIcon as FileJs,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { CloudImportPackageFile } from "./cloud-token";
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
type TransferProgress = { message: string; sentChunks: number; totalChunks: number };
function packageCountSummary(file: CloudImportPackageFile) {
  const counts = file.counts;
  return [
    `${counts.keywords} keywords`,
    `${counts.rankChecks} rank checks`,
    `${counts.alertRules} alert rules`,
    `${counts.competitors} competitors`,
    `${counts.notificationPreferences} notification preferences`,
    `${counts.savedViews} saved views`,
  ].join(" / ");
}
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
  progress?: TransferProgress | null;
  projectId: string;
  rawToken: string | null;
  serverTransferAction?: ServerTransferAction;
  transferPackageAction?: TransferPackageAction;
};
function errorMessage(error: unknown) {
  return actionErrorMessage(error, "Package transfer failed.");
}
function TransferStatus({
  displayedFilename,
  file,
  hasToken,
  message,
  missingTokenMessage,
  progress,
}: Readonly<{
  displayedFilename: string | null;
  file: CloudImportPackageFile | null;
  hasToken: boolean;
  message: string | null;
  missingTokenMessage: string;
  progress: PackageTransferPanelProps["progress"];
}>) {
  return (
    <>
      {file ? (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[11px] border border-border bg-bg-sunken px-3.5 py-3">
          <CheckCircle aria-hidden className="text-green" size={15} weight="fill" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
            {displayedFilename ?? file.filename}
          </span>
          <span className="font-mono text-[11px] text-fg-faint">{packageCountSummary(file)}</span>
        </div>
      ) : null}
      {progress ? (
        <div className="mx-5 mb-4 rounded-[11px] border border-border bg-bg px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="font-medium text-fg-muted">{progress.message}</span>
            {progress.totalChunks > 0 ? (
              <span className="font-mono text-[11px] text-fg-faint">
                {progress.sentChunks} of {progress.totalChunks}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {!hasToken ? (
        <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-[11px] border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-5 text-fg-muted">
          <WarningCircle aria-hidden className="mt-px flex-none text-accent" size={15} />
          {missingTokenMessage}
        </div>
      ) : null}
      {message ? (
        <div className="border-border-soft border-t px-5 py-3 text-[12.5px] text-fg-muted">
          {message}
        </div>
      ) : null}
    </>
  );
}
export function PackageTransferPanel({
  disabled,
  exportPackageAction,
  missingTokenMessage = "Generate a new token above before transferring. Existing tokens cannot be shown again.",
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
      setMessage("Package exported and downloaded. You can transfer this package now.");
    } catch (error) {
      setMessage(errorMessage(error));
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
      setMessage("Package loaded. Review the counts, then transfer it to the destination.");
    } catch (error) {
      setMessage(errorMessage(error));
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
      if (canTransfer === false) throw new Error("Read-only mode could not be enabled.");
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
        setMessage("Import complete. The destination committed the transferred package.");
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
      setMessage("Import complete. The destination committed the transferred package.");
    } catch (error) {
      setMessage(errorMessage(error));
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
    <div className="mt-[18px] overflow-hidden rounded-[14px] border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border-soft border-b p-[16px_20px]">
        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-blue/15 text-blue">
          <FileJs aria-hidden size={20} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">Package and transfer</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">
            {serverExport
              ? "Export this instance server-side and send it with the token."
              : "Export this instance or upload a JSON or zip export, then send it with the token."}
          </div>
        </div>
      </div>

      <div
        className={serverExport ? "grid gap-3 p-5" : "grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto]"}
      >
        {serverExport ? null : (
          <>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-bg px-3.5 font-semibold text-[13px] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={isBusy}
              onClick={handleExport}
              type="button"
            >
              <DownloadSimple aria-hidden size={15} />
              {busy === "export" ? "Exporting..." : "Export package"}
            </button>
            <label
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-bg px-3.5 font-semibold text-[13px] ${
                isBusy ? "cursor-not-allowed opacity-55" : "cursor-pointer"
              }`}
            >
              <FileArrowUp aria-hidden size={15} />
              {busy === "upload" ? "Reading..." : "Upload JSON or ZIP"}
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
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-[13px] text-white disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isBusy || !hasToken || (!serverExport && !file)}
          onClick={handleTransfer}
          type="button"
        >
          <CloudArrowUp aria-hidden size={15} weight="fill" />
          {busy === "transfer" ? "Transferring..." : "Transfer"}
          <ArrowRight aria-hidden size={12} weight="bold" />
        </button>
      </div>

      <TransferStatus
        displayedFilename={displayedFilename}
        file={file}
        hasToken={hasToken}
        message={message}
        missingTokenMessage={missingTokenMessage}
        progress={progress}
      />
    </div>
  );
}
