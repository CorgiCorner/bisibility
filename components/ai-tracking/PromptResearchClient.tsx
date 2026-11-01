"use client";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { inputActionSizeClassName } from "@/components/ui/input-styles";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import type { PromptResearchPageData } from "@/lib/actions/prompt-research";
import { promptResearchSearchSchema } from "@/lib/ai-research/prompt-research-schema";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { zodResolver } from "@hookform/resolvers/zod";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { PromptResearchKeyword } from "./PromptResearchKeyword";
import { PromptResearchMarket } from "./PromptResearchMarket";

export function PromptResearchClient({
  projectId,
  keyword = "",
  data,
}: Readonly<{
  projectId: string;
  keyword?: string;
  data: PromptResearchPageData;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const costT = useTranslations("projectAiResearch");
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(promptResearchSearchSchema),
    defaultValues: { keyword },
  });
  const error = form.formState.errors.keyword;
  const href = appPath(projectId, "prompt-research");
  const [sourceMissing, setSourceMissing] = useState(false);
  const noSource =
    !data.hasSource ||
    sourceMissing ||
    Boolean(data.initial && !data.initial.ok && data.initial.reason === "no_source");
  const showNotice = Boolean(data.initial?.ok && !data.initial.estimate);
  return (
    <div className="grid min-w-0 gap-4">
      {keyword ? <BackLink href={href}>{t("relevantKeywords")}</BackLink> : null}
      <ProviderAccessGate
        blocked={noSource}
        providers={data.supportingProviders}
        href={appPath(projectId, "providers")}
        surface="ai"
        showNotice={showNotice}
      >
        <Card className="min-w-0 w-full p-4 sm:p-5" size="md">
          <form
            onSubmit={form.handleSubmit(({ keyword }) =>
              router.push(`${href}?${new URLSearchParams({ q: keyword })}`),
            )}
            className="grid gap-3"
          >
            <label htmlFor="research-keyword" className="sr-only">
              {t("keyword")}
            </label>
            <div className="flex items-start gap-2">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon
                  weight="regular"
                  aria-hidden
                  size={16}
                  className="pointer-events-none absolute left-3 top-3 text-fg-muted"
                />
                <Input
                  id="research-keyword"
                  className="pl-9"
                  {...form.register("keyword")}
                  maxLength={100}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${error ? "research-error " : ""}research-cost`}
                  placeholder={t("placeholder")}
                />
              </div>
              <Button type="submit" className={cn(inputActionSizeClassName, "shrink-0")}>
                {t("search")}
              </Button>
            </div>
            {error ? (
              <p id="research-error" role="alert" className="m-0 text-ui-body text-red-text">
                {t(form.getValues("keyword").trim() ? "keywordTooLong" : "keywordRequired")}
              </p>
            ) : null}
            <p id="research-cost" className="m-0 text-ui-xs text-fg-muted">
              {costT("estimateRequired")}
            </p>
            <PromptResearchMarket />
          </form>
        </Card>
      </ProviderAccessGate>
      {noSource && !showNotice ? (
        <ProviderAccessEmptyState
          surface="ai"
          href={appPath(projectId, "providers")}
          providers={data.supportingProviders}
        />
      ) : null}
      {keyword ? (
        <ProviderAccessGate blocked={noSource} surface="ai" showNotice={false}>
          <PromptResearchKeyword
            key={keyword}
            projectId={projectId}
            keyword={keyword}
            data={{ ...data, hasSource: !noSource }}
            onSourceMissing={() => setSourceMissing(true)}
          />
        </ProviderAccessGate>
      ) : !noSource ? (
        <section
          className="overflow-hidden rounded-card border border-border bg-bg-elev"
          aria-labelledby="research-keywords"
        >
          <div className="border-b border-border px-4 py-3.5">
            <h2 id="research-keywords" className="m-0 text-[15px] font-semibold">
              {t("relevantKeywords")}
            </h2>
            <p className="m-0 mt-1 text-ui-xs text-fg-muted">{t("keywordsHint")}</p>
          </div>
          {data.keywords.length ? (
            <ul className="m-0 list-none divide-y divide-border-soft p-0">
              {data.keywords.map((value) => (
                <li key={value}>
                  <Link
                    className="flex items-center justify-between gap-3 px-4 py-3 text-ui-body font-medium hover:bg-bg-band focus-visible:outline focus-visible:outline-accent"
                    href={`${href}?${new URLSearchParams({ q: value })}`}
                  >
                    <span className="min-w-0 break-words">{value}</span>
                    <CaretRightIcon
                      weight="regular"
                      aria-hidden
                      size={16}
                      className="shrink-0 text-fg-muted"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 px-4 py-8 text-center text-ui-body text-fg-muted">
              {t("noKeywordsHint")}
            </p>
          )}
        </section>
      ) : null}
      <p className="m-0 text-ui-xs leading-relaxed text-fg-muted">{t("datasetNotice")}</p>
    </div>
  );
}
