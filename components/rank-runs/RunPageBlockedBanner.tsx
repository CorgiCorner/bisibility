"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui/Button";
import { appPath, appRootPath, type ProjectRef } from "@/lib/routing/app-path";
import { useLocale, useTranslations } from "next-intl";
import type { RunPageData } from "./RunPageTypes";
import { localizedBlockedRunCopy } from "./rank-run-copy";

function actionHref(
  action: "connection_settings" | "edit_budget" | "worker_status" | null,
  projectRef: ProjectRef,
) {
  if (action === "connection_settings") return appPath(projectRef, "integrations");
  if (action === "edit_budget") return appPath(projectRef, "settings", "usage?budget=edit");
  if (action === "worker_status") return appRootPath("admin");
  return null;
}

function actionLabel(
  action: "connection_settings" | "edit_budget" | "worker_status" | null,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
) {
  if (action === "connection_settings") return t("actions.connectionSettings");
  if (action === "edit_budget") return t("actions.editBudget");
  if (action === "worker_status") return t("actions.workerStatus");
  return null;
}

export function RunPageBlockedBanner({
  projectRef,
  run,
}: Readonly<{ projectRef: ProjectRef; run: RunPageData }>) {
  const deploymentMode = useDeploymentMode();
  const locale = useLocale();
  const t = useTranslations("projectRuns.rankRuns");
  if (run.status !== "blocked") return null;

  const presentation = localizedBlockedRunCopy(
    {
      budget: run.budget,
      deploymentMode,
      reason: run.blockedReason,
    },
    t,
    locale,
  );
  const action = actionLabel(presentation.action, t);
  const href = actionHref(presentation.action, projectRef);

  return (
    <section
      aria-label={t("blocked.guidance")}
      className="flex flex-wrap items-center gap-3 rounded-card border border-yellow/35 bg-yellow/10 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[13px] font-semibold text-fg">{presentation.title}</h2>
        <p className="m-0 mt-0.5 text-[12px] leading-[1.5] text-fg-muted">
          {presentation.description}
        </p>
      </div>
      {action && href ? (
        <Button href={href} size="xs" variant="secondary">
          {action}
        </Button>
      ) : null}
    </section>
  );
}
