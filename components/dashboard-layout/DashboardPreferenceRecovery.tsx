"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { readDashboardPreference } from "@/lib/project-surface-preferences/dashboard-actions";
import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type Props = {
  preference: DashboardSurfacePreference;
  onReview: (current: DashboardSurfacePreference, choice: "keep_draft" | "use_current") => void;
};

export function DashboardPreferenceRecovery({ preference, onReview }: Props) {
  const t = useTranslations("shared.dashboardLayout");
  const [latest, setLatest] = useState<DashboardSurfacePreference | null>(null);
  const [failure, setFailure] = useState(false);
  const [pending, start] = useTransition();
  if (!preference.notice) return null;
  const reviewable =
    latest &&
    !latest.notice &&
    latest.projectId === preference.projectId &&
    latest.revision > preference.revision;
  return (
    <Card component="section" aria-label={t("preferenceUnavailable")}>
      <p role="status" className="text-sm text-fg-muted">
        {t("preferenceUnavailable")}
      </p>
      <p className="mt-2 text-sm text-fg-muted">{t("preferencePreserved")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setFailure(false);
              try {
                const result = await readDashboardPreference(preference.projectId);
                if (result.ok) setLatest(result.value);
                else setFailure(true);
              } catch {
                setFailure(true);
              }
            })
          }
        >
          {t("reloadPreference")}
        </Button>
        {reviewable
          ? (["keep_draft", "use_current"] as const).map((choice) => (
              <Button key={choice} variant="outline" onClick={() => onReview(latest, choice)}>
                {t(choice === "keep_draft" ? "keepDraft" : "useCurrent")}
              </Button>
            ))
          : null}
      </div>
      {failure ? (
        <p role="alert" className="mt-2 text-sm text-red-text">
          {t("preferenceReloadFailed")}
        </p>
      ) : null}
      {reviewable ? (
        <p className="mt-2 text-sm text-fg-muted">
          {t("preferenceRevision", { revision: String(latest.revision) })}
        </p>
      ) : null}
    </Card>
  );
}
