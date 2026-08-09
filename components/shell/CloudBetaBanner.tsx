"use client";

import { Button } from "@/components/ui";
import { loadCloudBackupCounts } from "@/lib/actions/cloud";
import type { CloudBackupCounts } from "@/lib/migration/cloud-backup-sections";
import type { CloudPackageExportSummary } from "@/lib/queries/cloud-beta-export";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { WarningCircleIcon as WarningCircle, XIcon as X } from "@phosphor-icons/react";
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
  /** The banner's whole message is "keep an export"; hold it back until there is data. */
  hasExportableData?: boolean;
  isCloud: boolean;
  lastExport: CloudPackageExportSummary | null;
  now: string;
  projectId: string;
  projectRef: string;
  projectName: string;
};

/**
 * The two actions read as links, not buttons: full foreground colour so they carry contrast
 * against the tint, a resting underline so they are recognisable as controls without a chip, and
 * the message's own weight so neither competes with the page's primary action.
 */
const quietAction = {
  color: "var(--fg)",
  fontSize: "11.5px",
  fontWeight: 400,
  minHeight: 20,
  paddingX: 0,
  paddingY: 0,
  textDecorationColor: "color-mix(in srgb, var(--fg) 35%, transparent)",
  textDecorationLine: "underline",
  textUnderlineOffset: "3px",
  "&:hover": {
    backgroundColor: "transparent",
    color: "var(--fg)",
    textDecorationColor: "var(--fg)",
  },
};

function persistDismissal() {
  // biome-ignore lint/suspicious/noDocumentCookie: Client dismissal must survive the next request.
  document.cookie = `${CLOUD_BETA_DISMISSAL_COOKIE}=${CLOUD_BETA_DISMISSAL_VALUE}; path=/; max-age=${CLOUD_BETA_DISMISSAL_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function CloudBetaBanner({
  dismissed = false,
  hasExportableData = true,
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

  // An empty workspace has nothing to export, so the warning would only distract from
  // onboarding; it appears once the first keywords exist.
  if (!isCloud || isDismissed || !hasExportableData) {
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
      setBackupLoadError(actionErrorMessage(error, "Project backup counts could not be loaded."));
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <>
      <div className="@container">
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-yellow/[0.1] px-3 py-2.5 @sm:px-4"
          role="status"
        >
          {/* Glyph and message form one item so the row centres them together against the taller
              actions. Inside it they align to the top, which is where the first line is: centring
              the glyph against a wrapped three-line message would park it beside line two. Both
              carry the same font size and leading, so their first line boxes are identical.

              The wrapper then lifts the glyph by 1px. That is not taste: the font's ascent and
              descent are asymmetric (12 and 4 at this size), so the cap band of the text centres
              at 22.94px while a box-centred 17px glyph centres at 23.98px. Geometry alone reads
              as a low glyph; the correction puts the two optical centres together. It sits here
              rather than on the icon, which stays free of layout classes. */}
          <div className="flex min-w-0 flex-1 items-start gap-x-2">
            <span
              aria-hidden
              className="-translate-y-px flex h-lh shrink-0 items-center text-[12px] leading-[1.45] text-yellow-text"
              data-testid="cloud-beta-warning-line"
            >
              <WarningCircle
                className="shrink-0"
                data-testid="cloud-beta-warning-icon"
                size={17}
                weight="fill"
              />
            </span>
            <p
              className="m-0 min-w-0 flex-1 text-[12px] leading-[1.45] text-fg-muted"
              data-testid="cloud-beta-content"
            >
              {/* A single word space after a semibold clause reads as a collision; the extra
                  2px separates the lead from the sentence that qualifies it. */}
              <strong className="mr-0.5 font-semibold text-fg">You're on the hosted beta.</strong>{" "}
              Restores aren't guaranteed yet - keep an export.
            </p>
          </div>
          <button
            aria-label="Dismiss hosted beta banner"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-fg-muted transition-colors hover:bg-yellow/[0.14] hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid @xl:order-3"
            onClick={dismiss}
            type="button"
          >
            <X aria-hidden size={13} weight="bold" />
          </button>
          {/* Below the container's xl width the message needs the whole line, so the actions take
              a row of their own, indented to the message's text edge. The dismiss control keeps
              the first row in both layouts, which is why it precedes them in the markup and only
              moves past them once one row is wide enough for everything. */}
          <div
            className="flex shrink-0 basis-full items-center gap-x-3 pl-[25px] @xl:order-2 @xl:basis-auto @xl:pl-0"
            data-testid="cloud-beta-actions"
          >
            <Button
              onClick={() => setActiveModal("coverage")}
              size="sm"
              sx={quietAction}
              variant="ghost"
            >
              What beta covers
            </Button>
            <Button
              loading={backupLoading}
              loadingLabel="Loading..."
              onClick={() => void openBackup()}
              size="sm"
              sx={quietAction}
              variant="ghost"
            >
              Export data
            </Button>
          </div>
          {backupLoadError ? (
            <p className="m-0 basis-full pl-[25px] text-[11px] text-red-text" role="alert">
              {backupLoadError}
            </p>
          ) : null}
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
