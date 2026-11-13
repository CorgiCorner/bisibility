"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  type ResearchTabContext,
  researchCompetitorSummary,
} from "@/lib/ai-research/research-tab-model";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

const searchSchema = z.object({ keyword: z.string().trim().min(1).max(100) });

const researchContextChipClassName =
  "inline-flex max-w-full items-center rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-ui-caption text-fg no-underline";

export function ResearchLookupControls({
  actionLabel,
  context,
  disabled,
  keyword,
  onSearch,
  onSubmitCurrent,
  projectId,
}: Readonly<{
  actionLabel: string;
  context: ResearchTabContext;
  disabled: boolean;
  keyword: string;
  onSearch: (keyword: string) => void;
  onSubmitCurrent: () => void;
  projectId: string;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const form = useForm({ defaultValues: { keyword }, resolver: zodResolver(searchSchema) });
  const error = form.formState.errors.keyword;
  const competitorNames = researchCompetitorSummary(context.competitors.map((item) => item.label));
  return (
    <form
      className="flex min-w-0 flex-wrap items-center gap-2"
      onSubmit={form.handleSubmit(({ keyword: next }) => {
        if (next === keyword) onSubmitCurrent();
        else onSearch(next);
      })}
    >
      <label className="sr-only" htmlFor="research-query">
        {t("queryLabel")}
      </label>
      <Input
        aria-describedby={error ? "research-error" : undefined}
        aria-invalid={Boolean(error)}
        className="min-w-0 flex-1 basis-64"
        id="research-query"
        maxLength={100}
        placeholder={t("queryLabel")}
        {...form.register("keyword")}
      />
      <Tooltip content={t("marketTooltip")} semantics="description">
        <span className={researchContextChipClassName}>{t("marketChip")}</span>
      </Tooltip>
      <Tooltip content={t("competitorsHint")} semantics="description">
        <a className={researchContextChipClassName} href={context.competitorsHref}>
          {competitorNames
            ? t("competitorsUsed", { names: competitorNames })
            : t("competitorsNone")}
        </a>
      </Tooltip>
      <Tooltip content={t("sourceTooltip")} semantics="description">
        <span className={researchContextChipClassName}>{t("sourceLabel")}</span>
      </Tooltip>
      <Button size="input" disabled={disabled} type="submit">
        {actionLabel}
      </Button>
      <Button
        href={aiVisibilityTabHref(projectId, "research", { view: "brand" })}
        size="input"
        variant="secondary"
      >
        {t("brandLookup")}
      </Button>
      {error ? (
        <p className="m-0 basis-full text-ui-body text-red-text" id="research-error" role="alert">
          {t(form.getValues("keyword").trim() ? "keywordTooLong" : "keywordRequired")}
        </p>
      ) : null}
    </form>
  );
}
