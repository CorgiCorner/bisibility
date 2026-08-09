"use client";

import { AlertTargetUrlDialog } from "@/components/alerts/AlertTargetUrlDialog";
import { Button } from "@/components/ui";
import { getAlertCtaTargets, muteTriggeredAlert } from "@/lib/actions/alert-feed";
import {
  BellSlashIcon as BellSlash,
  CaretRightIcon as CaretRight,
  ColumnsIcon as Columns,
  ListMagnifyingGlassIcon as ListMagnifyingGlass,
  TargetIcon as Target,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ctaIcons: Record<string, Icon> = {
  "Compare SERP": Columns,
  "Open keyword": CaretRight,
  "Set target URL": Target,
  "Set winner URL": Target,
  "View SERP": ListMagnifyingGlass,
};

const serpCtas = new Set(["Compare SERP", "View SERP"]);
const targetCtas = new Set(["Set target URL", "Set winner URL"]);

type AlertRowActionsProps = {
  alertId: string;
  ctas: string[];
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialogTargetUrl, setDialogTargetUrl] = useState<string | null | undefined>(undefined);

  async function runCta(cta: string) {
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
      onError("Could not snooze alert. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      {ctas.map((cta) => {
        const CtaIcon = ctaIcons[cta] ?? CaretRight;

        return (
          <Button
            disabled={busy}
            key={cta}
            onClick={() => void runCta(cta)}
            size="sm"
            startIcon={<CtaIcon aria-hidden size={12} />}
            type="button"
            variant="secondary"
          >
            {cta}
          </Button>
        );
      })}
      <Button
        disabled={busy}
        onClick={() => void snooze()}
        size="sm"
        startIcon={<BellSlash aria-hidden size={12} />}
        type="button"
        variant="ghost"
      >
        Snooze
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
