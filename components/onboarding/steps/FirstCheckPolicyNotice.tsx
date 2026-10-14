"use client";
import { Button } from "@/components/ui/Button";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import type { FirstCheckRunState } from "./first-check-run-rows";

/** Configuration is a separate explicit action; retry alone cannot initialize semantic policy. */
export function FirstCheckPolicyNotice({
  projectId,
  state,
}: Readonly<{ projectId: string | null; state: FirstCheckRunState }>) {
  const t = useTranslations("shared.rankPreflight");
  if (
    !projectId ||
    !state.rows.some(
      (row) =>
        row.status === "failed" &&
        "code" in row &&
        (row.code === "measurement_policy_unconfigured" ||
          row.code === "measurement_policy_unsupported"),
    )
  )
    return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3" role="alert">
      <p className="m-0 text-[13px] leading-5 text-fg-muted">
        {t("measurementPolicyUnconfigured")}
      </p>
      <Button
        href={`${appPath(projectId, "settings", "tracking")}#measurement-policy`}
        size="sm"
        variant="secondary"
      >
        {t("configureMeasurementPolicy")}
      </Button>
    </div>
  );
}
