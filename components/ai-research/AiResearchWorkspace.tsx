"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { analyzeAiResearchAction } from "@/lib/actions/ai-research";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { AiResearchResults } from "./AiResearchResults";

type History = { id: string; title: string; createdAt: string }[];
export function AiResearchWorkspace({
  projectId,
  domain,
  mode,
  history,
  initialOutcome,
  canRun = true,
  analyzeAction = analyzeAiResearchAction,
}: Readonly<{
  projectId: string;
  domain: string;
  mode: "visibility" | "prompt";
  history: History;
  initialOutcome?: AiResearchOutcome;
  canRun?: boolean;
  analyzeAction?: typeof analyzeAiResearchAction;
}>) {
  const t = useTranslations("projectAiResearch");
  const schema = mode === "visibility" ? visibilitySchema : promptSchema;
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      brand: "",
      domain,
      max_cost_cents: mode === "prompt" ? 60 : 20,
      estimate_only: true,
      ...(mode === "prompt"
        ? { prompt: "", models: ["gpt-4.1-mini", "gpt-4.1-nano"] }
        : {
            platform: "chat_gpt",
            target_type: "domain",
            language_code: "en",
            location_code: 2840,
            limit: 10,
          }),
    },
  });
  const [outcome, setOutcome] = useState(initialOutcome);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(estimateOnly: boolean) {
    if (!canRun) return;
    form.setValue("estimate_only", estimateOnly);
    void form.handleSubmit((input) =>
      startTransition(async () => {
        setError(null);
        try {
          setOutcome(await analyzeAction(projectId, mode, input));
        } catch {
          setError(t("requestFailure"));
        }
      }),
    )();
  }
  return (
    <div className="grid min-w-0 gap-5">
      <p className="m-0 max-w-3xl text-ui-body leading-relaxed text-fg-muted">
        {mode === "visibility" ? t("visibilityDescription") : t("promptDescription")}
      </p>
      {!canRun ? <Card className="text-ui-body text-fg-muted">{t("readOnly")}</Card> : null}
      <Card>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(true);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor={"ai-brand"} className="grid gap-2 text-ui-body">
              {t("brand")}
              <Input id={"ai-brand"} {...form.register("brand")} placeholder="Acme" />
            </label>
            <label htmlFor={"ai-domain"} className="grid gap-2 text-ui-body">
              {t("domain")}
              <Input id={"ai-domain"} {...form.register("domain")} placeholder="acme.com" />
            </label>
            {mode === "visibility" ? (
              <>
                <Controller
                  name="platform"
                  control={form.control}
                  render={({ field }) => (
                    <div className="grid gap-2 text-ui-body">
                      <span>{t("platform")}</span>
                      <MenuSelect
                        ariaLabel="Platform"
                        size="input"
                        value={field.value ?? "chat_gpt"}
                        onChange={field.onChange}
                        options={[
                          { label: "ChatGPT", value: "chat_gpt" },
                          { label: "Google AI Overview", value: "google" },
                        ]}
                      />
                    </div>
                  )}
                />
                <Controller
                  name="target_type"
                  control={form.control}
                  render={({ field }) => (
                    <div className="grid gap-2 text-ui-body">
                      <span>{t("searchFor")}</span>
                      <MenuSelect
                        ariaLabel="Search target"
                        size="input"
                        value={field.value ?? "domain"}
                        onChange={field.onChange}
                        options={[
                          { label: t("domainCitations"), value: "domain" },
                          { label: t("brandMentions"), value: "brand" },
                        ]}
                      />
                    </div>
                  )}
                />
                <label htmlFor={"ai-location_code"} className="grid gap-2 text-ui-body">
                  {t("locationCode")}
                  <Input
                    id={"ai-location_code"}
                    type="number"
                    {...form.register("location_code", { valueAsNumber: true })}
                  />
                </label>
                <label htmlFor={"ai-language_code"} className="grid gap-2 text-ui-body">
                  {t("languageCode")}
                  <Input id={"ai-language_code"} {...form.register("language_code")} />
                </label>
              </>
            ) : (
              <label htmlFor={"ai-prompt"} className="grid gap-2 text-ui-body sm:col-span-2">
                {t("prompt")}
                <Input
                  id={"ai-prompt"}
                  {...form.register("prompt")}
                  placeholder="Which tools help small businesses track search visibility?"
                />
                <span className="text-ui-xs text-fg-muted">
                  GPT-4.1 mini + GPT-4.1 nano · Up to 512 output tokens per model · Web search
                  disabled
                </span>
              </label>
            )}
            <label htmlFor={"ai-max_cost_cents"} className="grid gap-2 text-ui-body">
              {t("costCap")}
              <Input
                id={"ai-max_cost_cents"}
                type="number"
                min={0}
                max={1000}
                {...form.register("max_cost_cents", { valueAsNumber: true })}
              />
            </label>
          </div>
          {Object.values(form.formState.errors).length ? (
            <p role="alert" className="text-ui-body text-red-text">
              {t("validation")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary" loading={pending} disabled={!canRun}>
              {t("estimateCost")}
            </Button>
            <Button
              type="button"
              onClick={() => submit(false)}
              loading={pending}
              disabled={!canRun}
            >
              {t("runAnalysis")}
            </Button>
            <span className="text-ui-xs text-fg-muted">{t("cacheHint")}</span>
          </div>
        </form>
      </Card>
      {error || (outcome && !outcome.ok) ? (
        <Card role="alert" className="text-ui-body text-red-text">
          {error ??
            (outcome && !outcome.ok
              ? t(outcome.reason === "no_source" ? "noSource" : "requestFailure")
              : "")}
        </Card>
      ) : null}
      {outcome?.ok && outcome.estimate ? (
        <Card className="text-ui-body">
          {t(mode === "prompt" ? "conservativeBound" : "visibilityEstimate", {
            cost: outcome.estimatedCostCents.toFixed(2),
          })}
        </Card>
      ) : null}
      {outcome?.ok && !outcome.estimate ? (
        <>
          <AiResearchResults result={outcome.result} />
          <Link
            className="text-ui-body text-accent-text underline"
            href={`/app/${projectId}/agent-reports/${outcome.reportId}`}
          >
            {t("openReport")}
          </Link>
        </>
      ) : !outcome ? (
        <EmptyState
          title={mode === "visibility" ? t("visibilityEmpty") : t("promptEmpty")}
          description={t("emptyDescription")}
        />
      ) : null}
      <Card>
        <h2 className="text-ui-body font-semibold">{t("recentReports")}</h2>
        {history.length ? (
          <div className="mt-3 grid gap-3">
            {history.map((report) => (
              <Link
                key={report.id}
                href={`/app/${projectId}/agent-reports/${report.id}`}
                className="flex flex-wrap justify-between gap-2 text-ui-body text-accent-text"
              >
                <span>{report.title}</span>
                <span className="font-mono text-ui-xs text-fg-muted">
                  {report.createdAt.slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-ui-body text-fg-muted">{t("historyEmpty")}</p>
        )}
      </Card>
    </div>
  );
}
