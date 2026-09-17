"use client";

import { AlertTargetUrlDialog } from "@/components/alerts/AlertTargetUrlDialog";
import type { AlertFeedCta } from "@/components/alerts/alert-feed-presentation";
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

function ctaLabel(cta: AlertFeedCta, t: ReturnType<typeof useTranslations<"projectAlerts.feed">>) {
  if (cta === "compare_serp") return t("ctaCompareSerp");
  if (cta === "open_keyword") return t("ctaOpenKeyword");
  if (cta === "set_target_url") return t("ctaSetTargetUrl");
  if (cta === "set_winner_url") return t("ctaSetWinnerUrl");
  return t("ctaViewSerp");
}

type AlertRowActionsProps = {
  alertId: string;
  ctas: AlertFeedCta[];
  keyword: string;
  onError: (message: string) => void;
  onSnooze: (id: string) => () => void;
  projectId: string;
};

export function AlertRowActions({
  alertId,
  ctas,
  keyword,
  onError,
  onSnooze,
  projectId,
}: Readonly<AlertRowActionsProps>) {
  const t = useTranslations("projectAlerts.feed");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialogTargetUrl, setDialogTargetUrl] = useState<string | null | undefined>(undefined);

  async function runCta(cta: AlertFeedCta) {
    setBusy(true);
    try {
      const targets = await getAlertCtaTargets({ alertId, projectId });
      if (targetCtas.has(cta)) {
        setDialogTargetUrl(targets.targetUrl);
        return;
      }
      if (serpCtas.has(cta)) {
        window.open(targets.serpUrl, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(targets.keywordHref);
    } catch {
      // Resolution failed; keep the row interactive so the user can retry.
    } finally {
      setBusy(false);
    }
  }

  async function snooze() {
    setBusy(true);
    const rollback = onSnooze(alertId);
    try {
      await muteTriggeredAlert({ alertId, projectId });
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
          <Button
            disabled={busy}
            key={cta}
            onClick={() => void runCta(cta)}
            size="sm"
            startIcon={<CtaIcon aria-hidden size={12} weight="regular" />}
            type="button"
            variant="secondary"
          >
            {ctaLabel(cta, t)}
          </Button>
        );
      })}
      <Button
        disabled={busy}
        onClick={() => void snooze()}
        size="sm"
        startIcon={<BellSlash weight="regular" aria-hidden size={12} />}
        type="button"
        variant="ghost"
      >
        {t("snooze")}
      </Button>
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
