"use client";

import { Button } from "@/components/ui";
import { loadCloudBackupCounts } from "@/lib/actions/cloud";
import type { CloudBackupCounts } from "@/lib/migration/cloud-backup-sections";
import type { CloudPackageExportSummary } from "@/lib/queries/cloud-beta-export";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  DownloadSimpleIcon as DownloadSimple,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { CloudBackupModal } from "./CloudBackupModal";
import { CloudBetaCoverageModal } from "./CloudBetaCoverageModal";
import {
  CLOUD_BETA_DISMISSAL_COOKIE,
  CLOUD_BETA_DISMISSAL_MAX_AGE_SECONDS,
  CLOUD_BETA_DISMISSAL_VALUE,
} from "./cloud-beta";

type CloudBetaBannerProps = {
  dismissed?: boolean;
  isCloud: boolean;
  lastExport: CloudPackageExportSummary | null;
  now: string;
  projectId: string;
  projectRef: string;
  projectName: string;
};

function persistDismissal() {
  // biome-ignore lint/suspicious/noDocumentCookie: Client dismissal must survive the next request.
  document.cookie = `${CLOUD_BETA_DISMISSAL_COOKIE}=${CLOUD_BETA_DISMISSAL_VALUE}; path=/; max-age=${CLOUD_BETA_DISMISSAL_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function CloudBetaBanner({
  dismissed = false,
  isCloud,
  lastExport,
  now,
  projectId,
  projectRef,
  projectName,
}: Readonly<CloudBetaBannerProps>) {
  const [isDismissed, setIsDismissed] = useState(dismissed);
  const [activeModal, setActiveModal] = useState<"backup" | "coverage" | null>(null);
  const [backupCounts, setBackupCounts] = useState<CloudBackupCounts | null>(null);
  const [backupLoadError, setBackupLoadError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [latestExport, setLatestExport] = useState(lastExport);

  if (!isCloud || isDismissed) {
    return null;
  }

  function dismiss() {
    persistDismissal();
    setIsDismissed(true);
  }

  async function openBackup() {
    setActiveModal(null);
    setBackupLoadError(null);
    setBackupLoading(true);
    try {
      setBackupCounts(await loadCloudBackupCounts({ projectId }));
      setActiveModal("backup");
    } catch (error) {
      setBackupLoadError(actionErrorMessage(error, "Workspace backup counts could not be loaded."));
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <>
      <div className="@container">
        <div
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-2 border-b border-border bg-yellow/[0.1] px-3 py-3 @sm:px-4 @4xl:grid-cols-[auto_minmax(0,1fr)_auto_auto] @4xl:items-center"
          role="status"
        >
          <span
            aria-hidden
            className="col-start-1 row-start-1 flex h-lh self-start items-center text-[12.5px] leading-[1.55] text-yellow-strong"
            data-testid="cloud-beta-warning-line"
          >
            <WarningCircle
              className="shrink-0"
              data-testid="cloud-beta-warning-icon"
              size={17}
              weight="fill"
            />
          </span>
          <div className="col-start-2 row-start-1 min-w-0" data-testid="cloud-beta-content">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[12.5px] font-semibold text-fg">
                Managed Cloud is in beta
              </strong>
            </div>
            <p className="m-0 mt-0.5 text-[12px] leading-[1.45] text-fg-muted">
              Tracking and history match self-hosted. Managed restores are not guaranteed yet - keep
              an export.
            </p>
          </div>
          <div
            className="col-start-2 col-end-4 row-start-2 grid grid-cols-1 gap-1.5 @lg:grid-cols-2 @4xl:col-start-3 @4xl:row-start-1 @4xl:flex @4xl:shrink-0 @4xl:items-center"
            data-testid="cloud-beta-actions"
          >
            <Button
              className="w-full @4xl:w-auto"
              onClick={() => setActiveModal("coverage")}
              size="sm"
              /* The banner sits on a yellow wash. The default opaque --bg-sunken hover
                 disappears into it on light, and any yellow tint turns muddy on both
                 themes. Overlay --fg instead: it is near-black on light and near-white on
                 dark, so one value darkens or lightens the wash without adding a hue. */
              sx={{
                "&:hover": {
                  backgroundColor: "color-mix(in srgb, var(--fg) 7%, transparent)",
                  color: "var(--fg)",
                },
              }}
              variant="ghost"
            >
              What beta covers
            </Button>
            <Button
              className="w-full @4xl:w-auto"
              loading={backupLoading}
              loadingLabel="Loading..."
              onClick={() => void openBackup()}
              size="sm"
              startIcon={<DownloadSimple aria-hidden size={14} weight="bold" />}
            >
              Export data
            </Button>
          </div>
          {backupLoadError ? (
            <p
              className="col-start-2 col-end-4 m-0 text-[11px] text-red @4xl:col-end-5"
              role="alert"
            >
              {backupLoadError}
            </p>
          ) : null}
          <button
            aria-label="Dismiss Cloud beta banner"
            className="col-start-3 row-start-1 grid h-8 w-8 shrink-0 place-items-center rounded-[7px] text-fg-muted outline-none transition-colors hover:bg-yellow/[0.14] hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent @4xl:col-start-4"
            onClick={dismiss}
            type="button"
          >
            <X aria-hidden size={13} weight="bold" />
          </button>
        </div>
      </div>
      {backupCounts ? (
        <CloudBackupModal
          counts={backupCounts}
          lastExport={latestExport}
          now={now}
          onClose={() => setActiveModal(null)}
          onExportSuccess={setLatestExport}
          open={activeModal === "backup"}
          projectId={projectId}
          projectRef={projectRef}
          projectName={projectName}
        />
      ) : null}
      <CloudBetaCoverageModal
        onClose={() => setActiveModal(null)}
        onExport={() => void openBackup()}
        open={activeModal === "coverage"}
        projectRef={projectRef}
      />
    </>
  );
}
