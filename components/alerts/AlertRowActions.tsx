"use client";

import { AlertTargetUrlDialog } from "@/components/alerts/AlertTargetUrlDialog";
import type { AlertFeedCta } from "@/components/alerts/alert-feed-presentation";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { getAlertCtaTargets, muteTriggeredAlert } from "@/lib/actions/alert-feed";
import { BellSlashIcon as BellSlash } from "@phosphor-icons/react/dist/csr/BellSlash";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ColumnsIcon as Columns } from "@phosphor-icons/react/dist/csr/Columns";
import { ListMagnifyingGlassIcon as ListMagnifyingGlass } from "@phosphor-icons/react/dist/csr/ListMagnifyingGlass";
import { TargetIcon as Target } from "@phosphor-icons/react/dist/csr/Target";
import type { Icon } from "@phosphor-icons/react/lib";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

const ctaIcons: Record<AlertFeedCta, Icon> = {
  compare_serp: Columns,
  open_keyword: CaretRight,
  set_target_url: Target,
  set_winner_url: Target,
  view_serp: ListMagnifyingGlass,
};

const serpCtas = new Set<AlertFeedCta>(["compare_serp", "view_serp"]);
const targetCtas = new Set<AlertFeedCta>(["set_target_url", "set_winner_url"]);

function webUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// The popup navigates itself through a noreferrer link, which matches the former
// window.open(url, "_blank", "noopener,noreferrer"); assigning popup.location would send the referrer.
function navigatePreparedWindow(popup: Window, value: string) {
  const href = webUrl(value);
  if (!href) return false;
  const link = popup.document.createElement("a");
  link.href = href;
  link.rel = "noopener noreferrer";
  (popup.document.body ?? popup.document.documentElement).append(link);
  link.click();
  return true;
}

function ctaLabel(cta: AlertFeedCta, t: ReturnType<typeof useTranslations<"projectAlerts.feed">>) {
  if (cta === "compare_serp") return t("ctaCompareSerp");
  if (cta === "open_keyword") return t("ctaOpenKeyword");
  if (cta === "set_target_url") return t("ctaSetTargetUrl");
  if (cta === "set_winner_url") return t("ctaSetWinnerUrl");
  return t("ctaViewSerp");
}

type AlertRowActionsProps = {
  alertId: string;
  canUpdate?: boolean;
  onSnoozed?: (id: string, until: string) => void;
  ctas: AlertFeedCta[];
  keyword: string;
  onError: (message: string) => void;
  onSnooze: (id: string) => () => void;
  projectId: string;
};

export function AlertRowActions({
  alertId,
  canUpdate = true,
  onSnoozed,
  ctas,
  keyword,
  onError,
  onSnooze,
  projectId,
}: Readonly<AlertRowActionsProps>) {
  const t = useTranslations("projectAlerts.feed");
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const mutationDisabled = !canUpdate || readOnly;
  const [busy, setBusy] = useState(false);
  const [dialogTargetUrl, setDialogTargetUrl] = useState<string | null | undefined>(undefined);

  async function runCta(cta: AlertFeedCta) {
    if (busy || (targetCtas.has(cta) && mutationDisabled)) return;
    const popup = serpCtas.has(cta) ? window.open("about:blank", "_blank") : null;
    if (serpCtas.has(cta) && !popup) {
      onError(t("ctaError"));
      return;
    }
    if (popup) popup.opener = null;
    setBusy(true);
    try {
      const targets = await getAlertCtaTargets({ alertId, projectId });
      if (targetCtas.has(cta)) {
        setDialogTargetUrl(targets.targetUrl);
        return;
      }
      if (popup) {
        if (!navigatePreparedWindow(popup, targets.serpUrl)) throw new Error("Unsafe SERP URL.");
        return;
      }
      router.push(targets.keywordHref);
    } catch {
      popup?.close();
      onError(t("ctaError"));
    } finally {
      setBusy(false);
    }
  }

  async function snooze() {
    if (busy || mutationDisabled) return;
    setBusy(true);
    const rollback = onSnooze(alertId);
    try {
      const result = await muteTriggeredAlert({ alertId, projectId });
      if (result?.snoozedUntil) onSnoozed?.(alertId, new Date(result.snoozedUntil).toISOString());
      router.refresh();
    } catch {
      rollback();
      onError(t("snoozeError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      {ctas.map((cta) => {
        const CtaIcon = ctaIcons[cta];

        return (
          <ProjectReadOnlyTooltip
            key={cta}
            disabledReason={targetCtas.has(cta) && !canUpdate ? t("readOnly") : undefined}
          >
            <Button
              disabled={busy || (targetCtas.has(cta) && mutationDisabled)}
              key={cta}
              onClick={() => void runCta(cta)}
              size="sm"
              startIcon={<CtaIcon aria-hidden size={12} weight="regular" />}
              type="button"
              variant="secondary"
            >
              {ctaLabel(cta, t)}
            </Button>
          </ProjectReadOnlyTooltip>
        );
      })}
      <ProjectReadOnlyTooltip disabledReason={!canUpdate ? t("readOnly") : undefined}>
        <Button
          disabled={busy || mutationDisabled}
          onClick={() => void snooze()}
          size="sm"
          startIcon={<BellSlash weight="regular" aria-hidden size={12} />}
          type="button"
          variant="ghost"
        >
          {t("snooze")}
        </Button>
      </ProjectReadOnlyTooltip>
      {dialogTargetUrl !== undefined ? (
        <AlertTargetUrlDialog
          alertId={alertId}
          keyword={keyword}
          onClose={() => setDialogTargetUrl(undefined)}
          projectId={projectId}
          targetUrl={dialogTargetUrl}
        />
      ) : null}
    </div>
  );
}
