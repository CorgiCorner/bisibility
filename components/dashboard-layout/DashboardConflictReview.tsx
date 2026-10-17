"use client";

import { Button } from "@/components/ui/Button";
import { type DashboardDraft, reviewDashboardConflict } from "@/lib/dashboard-layout/draft";
import {
  type DashboardSurfacePreference,
  dashboardLayoutFor,
} from "@/lib/project-surface-preferences/dashboard-model";
import { useTranslations } from "next-intl";
import { canReviewDashboardPreference } from "./dashboard-conflict";

type Props = {
  state: DashboardDraft;
  current: DashboardSurfacePreference | null;
  projectId: string;
  pending: boolean;
  onReload: () => void;
  onReview: (next: DashboardDraft, preference: DashboardSurfacePreference) => void;
};
export function DashboardConflictReview({
  state,
  current,
  projectId,
  pending,
  onReload,
  onReview,
}: Props) {
  const t = useTranslations("shared.dashboardLayout");
  const reviewable = canReviewDashboardPreference(current, projectId, state.expectedRevision);
  return (
    <section aria-label={t("reviewCurrent")} className="rounded-control border border-border p-3">
      <p>{t("reviewCurrent")}</p>
      {reviewable ? (
        <>
          <p className="text-sm text-fg-muted">
            {t("preferenceRevision", { revision: String(current.revision) })}
          </p>
          <ol>
            {dashboardLayoutFor(current, state.draft.preset)
              .widgets.filter(({ visible }) => visible)
              .map(({ id }) => (
                <li key={id}>{t(`widgets.${id}.label`)}</li>
              ))}
          </ol>
        </>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={onReload}>
          {t("reloadPreference")}
        </Button>
        {reviewable
          ? (["keep_draft", "use_current"] as const).map((choice) => (
              <Button
                key={choice}
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (!canReviewDashboardPreference(current, projectId, state.expectedRevision))
                    return;
                  onReview(
                    reviewDashboardConflict(
                      state,
                      dashboardLayoutFor(current, state.draft.preset),
                      current.revision,
                      choice,
                    ),
                    current,
                  );
                }}
              >
                {t(choice === "keep_draft" ? "keepDraft" : "useCurrent")}
              </Button>
            ))
          : null}
      </div>
    </section>
  );
}
