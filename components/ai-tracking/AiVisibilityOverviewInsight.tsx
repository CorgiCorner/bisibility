"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import type { OverviewInsight } from "@/lib/ai-tracking/overview-model";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";
import { overviewEngineCopy, overviewEngineLabel, overviewList } from "./overview-labels";

const CHANGE_EVENT = "bisibility:ai-visibility-overview-insight-change";

export function overviewInsightDismissalKey(projectId: string) {
  return `bisibility:ai-visibility:overview-insight:v1:${projectId}`;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function readDismissed(projectId: string) {
  try {
    return window.localStorage.getItem(overviewInsightDismissalKey(projectId)) === "dismissed";
  } catch {
    return false;
  }
}

export function AiVisibilityOverviewInsight({
  insight,
  projectId,
  sourcesHref,
}: Readonly<{
  insight: OverviewInsight | null;
  projectId: string;
  sourcesHref: string | null;
}>) {
  const t = useTranslations("projectAiTracking");
  const locale = useLocale();
  const readStoredDismissal = useCallback(() => readDismissed(projectId), [projectId]);
  const storedDismissal = useSyncExternalStore(subscribe, readStoredDismissal, () => false);
  const [localDismissal, setLocalDismissal] = useState<{
    dismissed: boolean;
    projectId: string;
  } | null>(null);
  const dismissed =
    (localDismissal?.projectId === projectId ? localDismissal.dismissed : null) ?? storedDismissal;

  function dismiss() {
    try {
      window.localStorage.setItem(overviewInsightDismissalKey(projectId), "dismissed");
      setLocalDismissal(null);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      setLocalDismissal({ dismissed: true, projectId });
    }
  }

  if (!insight || dismissed) return null;
  const labels = overviewEngineCopy((key) => t(key));
  const engines = overviewList(
    locale,
    insight.engines.map((engine) => overviewEngineLabel(engine, labels)),
  );
  const domains = overviewList(locale, insight.domains);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 font-sans text-ui-section">{t("overview.insightTitle")}</h2>
        <IconButton aria-label={t("overview.insightDismiss")} onClick={dismiss} type="button">
          <XIcon aria-hidden size={16} weight="regular" />
        </IconButton>
      </div>
      <p className="m-0 text-ui-body">
        {insight.domains.length
          ? t("overview.insightBuilt", {
              answers: insight.answers,
              domains,
              engineCount: insight.engines.length,
              engines,
            })
          : t("overview.insightNoDomains", { answers: insight.answers })}
      </p>
      <p className="m-0 text-ui-caption text-fg-muted">{linkSentence(insight, t)}</p>
      {insight.domains.length ? (
        <p className="m-0 text-ui-caption text-fg-muted">{t("overview.insightPath")}</p>
      ) : null}
      {sourcesHref ? (
        <Button
          className="w-fit self-start"
          component={Link}
          href={sourcesHref}
          size="sm"
          variant="secondary"
        >
          {t("overview.insightOpenSources")}
        </Button>
      ) : null}
    </Card>
  );
}

function linkSentence(
  insight: OverviewInsight,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
) {
  if (insight.ownLinks === 0) {
    return insight.domain
      ? t("overview.insightLinksNone", { domain: insight.domain, totalLinks: insight.totalLinks })
      : t("overview.insightLinksNoneSite", { totalLinks: insight.totalLinks });
  }
  return insight.domain
    ? t("overview.insightLinksSome", {
        domain: insight.domain,
        ownLinks: insight.ownLinks,
        totalLinks: insight.totalLinks,
      })
    : t("overview.insightLinksSomeSite", {
        ownLinks: insight.ownLinks,
        totalLinks: insight.totalLinks,
      });
}
