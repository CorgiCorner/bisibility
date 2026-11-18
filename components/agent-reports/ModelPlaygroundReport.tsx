"use client";
import { ModelPlaygroundColumns } from "@/components/ai-research/ModelPlaygroundColumns";
import { ModelPlaygroundMatrix } from "@/components/ai-research/ModelPlaygroundMatrix";
import { ModelPlaygroundSources } from "@/components/ai-research/ModelPlaygroundSources";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import {
  combinedReportedCost,
  type ModelPlaygroundReport as Report,
  reportColumns,
} from "@/lib/model-playground/report-body";
import { resultMatrix } from "@/lib/model-playground/result-view";
import { useFormatter, useLocale, useTranslations } from "next-intl";

export function ModelPlaygroundReport({ body }: Readonly<{ body: Report }>) {
  const t = useTranslations("projectAiResearch.modelPlayground");
  const format = useFormatter();
  const locale = useLocale();
  const columns = reportColumns(body);
  const cost = combinedReportedCost(body.results);
  return (
    <div className="grid min-w-0 gap-4" data-model-report>
      <p className="m-0 whitespace-pre-wrap break-words text-ui-body">{body.input.prompt}</p>
      <p className="m-0 text-ui-caption text-fg-muted">
        {t("reportCaption", { language: body.input.responseLanguage })} ·{" "}
        {cost.kind === "amount"
          ? t("reportTotalCost", { cost: formatPaymentAmount(cost.amount, locale) })
          : t("reportUnknownCost")}
      </p>
      <p className="m-0 text-ui-caption text-fg-muted">
        {body.brandsCapturedAt
          ? t("reportBrandsCaptured", {
              date: format.dateTime(new Date(body.brandsCapturedAt), { dateStyle: "medium" }),
            })
          : t("reportBrandsUnknown")}
      </p>
      <ModelPlaygroundColumns
        columns={columns}
        entities={body.entities}
        running={false}
        disabled
        onRemove={() => {}}
      />
      <ModelPlaygroundMatrix columns={columns} rows={resultMatrix(columns, body.entities)} />
      <ModelPlaygroundSources columns={columns} />
    </div>
  );
}
