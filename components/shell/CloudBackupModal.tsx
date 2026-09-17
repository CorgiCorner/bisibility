"use client";

import { downloadWorkspacePackage } from "@/components/cloud/workspace-package-download";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { exportActiveCloudImportPackage } from "@/components/settings/migration/MigrateToCloudExportPackage";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  CLOUD_BACKUP_SECTIONS,
  type CloudBackupCounts,
} from "@/lib/migration/cloud-backup-sections";
import type { CloudPackageExportSummary } from "@/lib/queries/cloud-beta-export";
import { CheckSquareIcon as CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { presentCloudBackupActionError } from "./cloud-backup-action-error";

type CloudBackupModalProps = {
  counts: CloudBackupCounts;
  lastExport: CloudPackageExportSummary | null;
  now: string;
  onClose: () => void;
  onExportSuccess?: (summary: CloudPackageExportSummary) => void;
  open: boolean;
  projectId: string;
  projectName: string;
};

export function CloudBackupModal({
  counts,
  lastExport,
  now,
  onClose,
  onExportSuccess,
  open,
  projectId,
  projectName,
}: Readonly<CloudBackupModalProps>) {
  const sharedErrors = useSharedErrorMessages();
  const format = useFormatter();
  const t = useTranslations("shell.backup");
  const [displayedExport, setDisplayedExport] = useState(lastExport);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const file = await exportActiveCloudImportPackage({ projectId });
      await downloadWorkspacePackage(file);
      const summary = {
        exportedAt: new Date().toISOString(),
      };
      setDisplayedExport(summary);
      onExportSuccess?.(summary);
      setFeedback({ message: t("success"), tone: "success" });
    } catch (error) {
      setFeedback({
        message: presentCloudBackupActionError(error, sharedErrors, {
          exportFallback: () => t("exportError"),
          keywordLimit: ({ limit }) => t("errors.keywordLimit", { limit }),
          rankCheckLimit: ({ limit }) => t("errors.rankCheckLimit", { limit }),
          unsupportedHistory: () => t("errors.unsupportedHistory"),
        }),
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const lastExportLabel = displayedExport
    ? backupLastExportLabel(new Date(displayedExport.exportedAt), new Date(now), t)
    : t("lastExport.never");
  const sectionCopy = {
    alert_rules: {
      description: t("sections.alert_rules.description"),
      label: t("sections.alert_rules.label"),
    },
    competitors: {
      description: t("sections.competitors.description"),
      label: t("sections.competitors.label"),
    },
    keywords: {
      description: t("sections.keywords.description"),
      label: t("sections.keywords.label"),
    },
    notification_preferences: {
      description: t("sections.notification_preferences.description"),
      label: t("sections.notification_preferences.label"),
    },
    projects: {
      description: t("sections.projects.description"),
      label: t("sections.projects.label"),
    },
    rank_checks: {
      description: t("sections.rank_checks.description"),
      label: t("sections.rank_checks.label"),
    },
    saved_views: {
      description: t("sections.saved_views.description"),
      label: t("sections.saved_views.label"),
    },
  } satisfies Record<
    (typeof CLOUD_BACKUP_SECTIONS)[number]["payloadKey"],
    { description: string; label: string }
  >;

  return (
    <Modal
      contentClassName="py-4"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">{t("duration")}</span>
          <Button
            disabled={isSubmitting}
            onClick={onClose}
            style={{ flexShrink: 0 }}
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
          <Button
            form="cloud-workspace-backup"
            loading={isSubmitting}
            loadingLabel={t("exporting")}
            startIcon={<DownloadSimple aria-hidden size={15} weight="regular" />}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
            type="submit"
          >
            {t("exportPackage")}
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      title={
        <span className="block">
          <span className="block">{t("title")}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] font-normal tracking-normal text-fg-muted">
            <span>{t("subtitle", { projectName })}</span>
            <span
              className="inline-flex rounded-full border border-border bg-bg-sunken px-2 py-0.5 text-[9.5px] font-medium leading-none tracking-[0.25px] text-fg-muted"
              data-testid="cloud-backup-export-status"
            >
              {lastExportLabel}
            </span>
          </span>
        </span>
      }
      width={520}
    >
      <form
        className="grid gap-4.5"
        id="cloud-workspace-backup"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <section>
          <div className="text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {t("included")}
          </div>
          <div className="mt-2 grid gap-1.5">
            {CLOUD_BACKUP_SECTIONS.map((section) => {
              const copy = sectionCopy[section.payloadKey];
              return (
                <div
                  className="flex items-center gap-2.5 rounded-control border border-border px-2.5 py-2"
                  key={section.payloadKey}
                >
                  <CheckSquare
                    aria-hidden
                    className="shrink-0 text-accent-text"
                    size={17}
                    weight="regular"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium">{copy.label}</span>
                    <span className="block text-[10.5px] text-fg-muted">{copy.description}</span>
                  </span>
                  {section.countable ? (
                    <span className="text-[10px] text-fg-muted tabular-nums">
                      {format.number(counts[section.countKey])}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {feedback ? (
          <p
            className={`m-0 text-[12px] ${feedback.tone === "error" ? "text-red-text" : "text-green-text"}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function backupLastExportLabel(
  date: Date,
  now: Date,
  t: ReturnType<typeof useTranslations<"shell.backup">>,
) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return t("lastExport.justNow");
  if (minutes < 60) return t("lastExport.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("lastExport.hours", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("lastExport.yesterday") : t("lastExport.days", { count: days });
}
