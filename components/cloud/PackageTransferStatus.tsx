"use client";

import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useTranslations } from "next-intl";
import type { CloudImportPackageFile } from "./cloud-token";
import { packageCountSummary } from "./package-transfer-helpers";

export type PackageTransferProgress = {
  message: string;
  sentChunks: number;
  totalChunks: number;
};

type PackageTransferStatusProps = {
  displayedFilename: string | null;
  file: CloudImportPackageFile | null;
  hasToken: boolean;
  message: string | null;
  missingTokenMessage: string;
  progress: PackageTransferProgress | null | undefined;
};

export function PackageTransferStatus({
  displayedFilename,
  file,
  hasToken,
  message,
  missingTokenMessage,
  progress,
}: Readonly<PackageTransferStatusProps>) {
  const t = useTranslations("projectSettingsMigration.package");
  return (
    <>
      {file ? (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border bg-bg-sunken px-3.5 py-3">
          <CheckCircle aria-hidden className="text-green-text" size={15} weight="regular" />
          <span className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
            {displayedFilename ?? file.filename}
          </span>
          <span className="font-sans tabular-nums text-[11px] text-fg-muted">
            {packageCountSummary(file, t)}
          </span>
        </div>
      ) : null}
      {progress ? (
        <div className="mx-5 mb-4 rounded-control border border-border bg-bg px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="font-medium text-fg-muted">{progress.message}</span>
            {progress.totalChunks > 0 ? (
              <span className="font-sans tabular-nums text-[11px] text-fg-muted">
                {t("progress", { sent: progress.sentChunks, total: progress.totalChunks })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {!hasToken ? (
        <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-control border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-5 text-fg-muted">
          {/* biome-ignore format: Keep this icon compact for the file line limit. */}
          <WarningCircle aria-hidden className="mt-px flex-none text-accent-text" size={15} weight="regular" />
          {missingTokenMessage}
        </div>
      ) : null}
      {message ? (
        <div className="border-border border-t px-5 py-3 text-[12.5px] text-fg-muted">
          {message}
        </div>
      ) : null}
    </>
  );
}
