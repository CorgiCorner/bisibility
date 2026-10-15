"use client";

import { PageContent } from "@/components/shell/PageContent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LEGACY_PRICING_CHECKED_AT } from "@/lib/ai-research/legacy";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

function Field({
  label,
  children,
  wide = false,
  multiline = false,
  hint,
  textInput = false,
}: Readonly<{
  label: string;
  children?: ReactNode;
  wide?: boolean;
  multiline?: boolean;
  hint?: string;
  textInput?: boolean;
}>) {
  return (
    <div className={`grid gap-2 text-ui-body ${wide ? "sm:col-span-2" : ""}`}>
      <span>{label}</span>
      {children ??
        (textInput ? (
          <Input
            disabled
            tabIndex={-1}
            aria-hidden
            className="bg-bg-sunken motion-safe:animate-pulse"
          />
        ) : (
          <div
            className={`${multiline ? "min-h-[122px]" : "h-10"} w-full rounded-control border border-border bg-bg-sunken motion-safe:animate-pulse`}
          />
        ))}
      {hint && <span className="text-ui-xs text-fg-muted">{hint}</span>}
    </div>
  );
}

export function AiResearchPageLoading() {
  const t = useTranslations("projectAiResearch");
  return (
    <PageContent variant="section" aria-busy="true">
      <div aria-hidden className="grid min-w-0 gap-5">
        <p className="m-0 max-w-3xl text-ui-body leading-relaxed text-fg-muted">
          {t("promptDescription")}
        </p>
        <Card>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("brand")} textInput />
              <Field label={t("domain")} textInput />
              <div className="grid gap-2 text-ui-xs text-fg-muted sm:col-span-2">
                <span>{t("legacyPricingProvenance", { date: LEGACY_PRICING_CHECKED_AT })}</span>
              </div>
              <Field label={t("prompt")} wide multiline />
              <Field label={t("firstModel")} />
              <Field label={t("secondModel")} />
              <Field label={t("responseLanguage")} hint={t("legacyPromptLanguageHint")} />
              <Field
                label={t("outputTokens")}
                textInput
                hint={t("tokenBounds", { min: 512, max: 512 })}
              />
              <Checkbox
                disabled
                tabIndex={-1}
                containerClassName="sm:col-span-2"
                label={t("webSearch")}
                description={<span>{t("webSearchPolicyPending")}</span>}
              />
              <Field label={t("costPolicy")} wide />
              <Field label={t("costCap")} textInput />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled tabIndex={-1} variant="secondary">
                {t("estimateCost")}
              </Button>
              <Button disabled tabIndex={-1}>
                {t("runAnalysis")}
              </Button>
              <span className="text-ui-xs text-fg-muted">{t("cacheHint")}</span>
            </div>
            <p className="m-0 text-ui-xs text-fg-muted">{t("estimateRequired")}</p>
          </div>
        </Card>
        <div className="opacity-40 motion-safe:animate-pulse">
          <EmptyState title={t("promptEmpty")} description={t("emptyDescription")} />
        </div>
        <Card>
          <h2 className="text-ui-body font-semibold">{t("recentReports")}</h2>
          <div className="mt-2 h-[1lh] text-ui-body w-56 max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse" />
        </Card>
      </div>
    </PageContent>
  );
}
