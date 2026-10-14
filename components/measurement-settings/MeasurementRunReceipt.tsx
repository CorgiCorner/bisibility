import type { LaunchRankCheckRunCreatedResult } from "@/lib/rank-check/runs/launch-types";
import { appPath } from "@/lib/routing/app-path";
import type { MeasurementTranslator } from "./contracts";
export function MeasurementRunReceipt({
  projectId,
  result,
  translate: t,
}: Readonly<{
  projectId: string;
  result: LaunchRankCheckRunCreatedResult;
  translate: MeasurementTranslator;
}>) {
  return (
    <section className="mt-3 rounded-control border border-border p-3" aria-label={t("runReceipt")}>
      <p className="m-0 text-sm">
        {t("runAccepted", { keywords: result.keywordCount, targets: result.targetCount })}
      </p>
      <p className="mt-2 text-sm text-fg-muted">{t(`runStatuses.${result.status}`)}</p>
      <a
        className="mt-2 inline-block text-sm text-accent-foreground underline"
        href={appPath(projectId, "rank-tracker", "runs", result.publicId)}
      >
        {t("viewRun")}
      </a>
      <p className="mt-2 text-sm text-fg-muted">{t("runReceiptHelp")}</p>
    </section>
  );
}
