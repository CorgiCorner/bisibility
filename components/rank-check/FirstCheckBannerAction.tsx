"use client";
import { useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { ProjectRef } from "@/lib/routing/app-path";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type RunFirstCheckAction = (input: { keywordId: string }) => Promise<unknown>;
export type GetFirstCheckRunPlanAction = (input: {
  projectId: string;
}) => Promise<FirstCheckRunPlan>;
type FirstCheckBannerActionProps = {
  getFirstCheckRunPlanAction: GetFirstCheckRunPlanAction;
  keywordId: string;
  projectId: string;
  projectRef?: ProjectRef;
  runCheckNowAction: RunFirstCheckAction;
};

export function FirstCheckBannerAction({
  getFirstCheckRunPlanAction,
  keywordId,
  projectId,
  projectRef,
}: Readonly<FirstCheckBannerActionProps>) {
  const t = useTranslations("shared.firstCheck");
  const { readOnly } = useProjectWriteMode();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const preflight = useRunPreflight({ projectId: projectRef ?? projectId });
  return (
    <>
      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly || loading || preflight.opening}
            onClick={async () => {
              if (!isPublicIdOfType(keywordId, "kw")) return;
              setLoading(true);
              setError(false);
              try {
                const plan = await getFirstCheckRunPlanAction({ projectId });
                await preflight.request({
                  depth: resolveSerpDepth(plan.scope.depth),
                  title: t("action"),
                  spec: { kind: "single", keywordId, v: 1 },
                });
              } catch {
                setError(true);
              } finally {
                setLoading(false);
              }
            }}
            size="sm"
            type="button"
          >
            {t("action")}
          </Button>
        </ProjectReadOnlyTooltip>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-text">
          {t("errors.loadPlan")}
        </p>
      ) : null}
      {preflight.dialog}
    </>
  );
}
