"use client";
import { SerpFeatureSummary } from "@/components/keywords/SerpFeatureSummary";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { Spinner } from "@/components/ui/Spinner";
import { formatMeasuredPaymentAmount } from "@/lib/action-payment/format";
import { centsToDollars } from "@/lib/format/currency";
import type { ComparisonProvider, ComparisonRun } from "@/lib/provider-comparison/types";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AddPlaygroundProvider } from "./AddPlaygroundProvider";
import { providerLabels } from "./provider-labels";
import { RawProviderResult } from "./RawProviderResult";
import { SavePlaygroundResult } from "./SavePlaygroundResult";

export { providerLabels } from "./provider-labels";
export function SerpPlaygroundResults({
  providers,
  run,
  view,
  loading,
  projectRef,
  readyProviders = [],
  selectedProviders = [],
  onAddProvider,
}: {
  providers: readonly ComparisonProvider[];
  run: ComparisonRun | null;
  view: "serp" | "json" | "provider";
  loading: boolean;
  projectRef?: string;
  readyProviders?: readonly ComparisonProvider[];
  selectedProviders?: readonly ComparisonProvider[];
  onAddProvider?: (provider: ComparisonProvider) => void;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const format = useFormatter();
  const locale = useLocale();
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2" aria-live="polite">
      {providers.map((provider) => {
        const side = run?.sides.find((item) => item.provider === provider);
        const pending = side ? side.status === "queued" || side.status === "claimed" : loading;
        const result = side?.result;
        const json = result ? JSON.stringify(result, null, 2) : "";
        return (
          <Card
            key={provider}
            className={`flex min-w-0 flex-col overflow-hidden p-0 lg:min-h-[360px] ${result ? "" : "min-h-[280px]"}`}
            aria-label={providerLabels[provider]}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="m-0 flex items-center gap-2 text-ui-section">
                <ProviderLogo
                  alt=""
                  domain={provider === "serpapi" ? "serpapi.com" : "dataforseo.com"}
                  fallbackIcon="magnifier"
                  size="xs"
                  tint="var(--fg-muted)"
                />
                {providerLabels[provider]}
              </h2>
              {pending ? (
                <Spinner size={16} />
              ) : result && view !== "provider" ? (
                <span className="text-xs text-fg-muted">
                  {t("resultCount", { count: String(result.results.length) })}
                </span>
              ) : null}
            </div>
            {view === "serp" && result?.features ? (
              <SerpFeatureSummary features={result.features} />
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col">
              {pending && !result ? (
                <div className="space-y-5 p-5" role="status" aria-label={t("loadingResults")}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <div className="space-y-2" key={index}>
                      <div className="h-3 w-1/3 animate-pulse rounded-control bg-bg-sunken" />
                      <div className="h-4 w-4/5 animate-pulse rounded-control bg-bg-sunken" />
                      <div className="h-3 w-3/5 animate-pulse rounded-control bg-bg-sunken" />
                    </div>
                  ))}
                </div>
              ) : !result ? (
                <div className="grid flex-1 place-items-center">
                  <EmptyState
                    compact
                    icon={<MagnifyingGlassIcon size={20} aria-hidden />}
                    title={
                      side?.status === "failed" ||
                      side?.status === "unknown" ||
                      side?.status === "cancelled"
                        ? t("resultFailed")
                        : t("emptyTitle")
                    }
                    description={
                      side?.status === "failed" ||
                      side?.status === "unknown" ||
                      side?.status === "cancelled"
                        ? t("resultFailedHelp")
                        : t("emptyHelp")
                    }
                  />
                </div>
              ) : view === "provider" && projectRef && run ? (
                <RawProviderResult
                  key={`${run.id}:${provider}`}
                  projectRef={projectRef}
                  runId={run.id}
                  provider={provider}
                />
              ) : view === "json" ? (
                <div className="relative min-w-0">
                  <div className="absolute right-3 top-3 z-10">
                    <CopyButton text={json} label={t("copyJson")} />
                  </div>
                  <pre className="m-0 max-h-[560px] overflow-auto p-5 pr-14 text-xs leading-5">
                    {json}
                  </pre>
                </div>
              ) : !result.results.length ? (
                <EmptyState compact title={t("noResults")} description={t("noResultsHelp")} />
              ) : (
                <ol className="m-0 max-h-[580px] list-none divide-y divide-border-soft overflow-auto p-0">
                  {result.results.map((row, index) => (
                    <li
                      key={`${row.rank}:${row.url}:${index}`}
                      className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 px-5 py-4"
                    >
                      <span className="pt-1 text-xs tabular-nums text-fg-muted">
                        {format.number(row.rank)}
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 break-all text-xs text-fg-muted">
                          {row.domain || new URL(row.url).hostname}
                        </p>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 block break-words text-sm font-medium text-fg underline-offset-4 hover:underline"
                        >
                          {row.title || row.url}
                        </a>
                        <p className="mb-0 mt-1 truncate text-xs text-fg-muted">{row.url}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {view === "serp" &&
            result &&
            result.results.length > 0 &&
            projectRef &&
            run &&
            side?.canSave ? (
              <div className="px-5 py-3">
                <SavePlaygroundResult
                  key={`${run.id}:${provider}`}
                  projectRef={projectRef}
                  runId={run.id}
                  provider={provider}
                  saved={Boolean(side.savedCheckRef)}
                />
              </div>
            ) : null}
            {side && !pending ? (
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-fg-muted">
                <span>
                  {side.result?.observedAt
                    ? format.dateTime(new Date(side.result.observedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : t("savedResult")}
                </span>
                <span>
                  {side.customerCostCents != null || side.costCents != null
                    ? formatMeasuredPaymentAmount(
                        {
                          value: String(
                            centsToDollars(side.customerCostCents ?? side.costCents ?? 0),
                          ),
                          unit: { kind: "currency", code: "USD" },
                          certainty: "measured",
                        },
                        locale,
                      )
                    : t("costUnknown")}
                </span>
              </div>
            ) : null}
          </Card>
        );
      })}
      {providers.length === 1 && projectRef && onAddProvider
        ? (() => {
            const other = providers[0] === "dataforseo" ? "serpapi" : "dataforseo";
            return (
              <AddPlaygroundProvider
                provider={other}
                ready={readyProviders.includes(other)}
                selected={selectedProviders.includes(other)}
                onAdd={() => onAddProvider(other)}
                projectRef={projectRef}
              />
            );
          })()
        : null}
    </div>
  );
}
