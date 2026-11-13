"use client";

import { LocationField } from "@/components/keywords/LocationField";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import type { PlaygroundPageData } from "@/lib/provider-comparison/playground-model";
import { appPath } from "@/lib/routing/app-path";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PlaygroundProviders } from "./PlaygroundProviders";
import { PlaygroundQueryScope } from "./PlaygroundQueryScope";
import { PlaygroundReview } from "./PlaygroundReview";
import { SerpPlaygroundHistoryButton, SerpPlaygroundSuggestions } from "./SerpPlaygroundHistory";
import { SerpPlaygroundResults } from "./SerpPlaygroundResults";
import { playgroundActions, useSerpPlayground } from "./useSerpPlayground";

export function SerpPlayground({
  projectRef,
  data,
  service = playgroundActions,
}: {
  projectRef: string;
  data: PlaygroundPageData;
  service?: typeof playgroundActions;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const {
    depth,
    setDepth,
    query,
    setQuery,
    location,
    setLocation,
    language,
    setLanguage,
    device,
    setDevice,
    providers,
    setProviders,
    view,
    setView,
    history,
    run,
    selectRun,
    review,
    setReview,
    busy,
    error,
    savedShown,
    openPrevious,
    hasConnection,
    activeProviders,
    pendingRun,
    preview,
    launch,
    refresh,
  } = useSerpPlayground(projectRef, data, service);
  const [queryFocused, setQueryFocused] = useState(false);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <p className="m-0 text-sm text-fg-muted">{t("intro")}</p>
      </div>
      <Card className="grid min-w-0 gap-5 p-5">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void preview();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="relative flex min-w-0 flex-col gap-1.5">
              <FieldLabel
                htmlFor="serp-query"
                label={t("query")}
                className="text-[10px] uppercase tracking-[0.4px] text-fg-muted"
              />
              <Input
                id="serp-query"
                value={query}
                onBlur={() => setQueryFocused(false)}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setQueryFocused(true)}
                placeholder={t("queryPlaceholder")}
                maxLength={500}
                disabled={busy}
              />
              <SerpPlaygroundSuggestions
                focused={queryFocused}
                projectRef={projectRef}
                query={query}
                selectRun={selectRun}
              />
            </div>
            <div className="flex items-end gap-2">
              <SerpPlaygroundHistoryButton projectRef={projectRef} selectRun={selectRun} />
              <Button
                type="submit"
                disabled={
                  !data.canRun || !hasConnection || !providers.length || !query.trim() || busy
                }
                loading={busy && !pendingRun}
                startIcon={<MagnifyingGlassIcon weight="regular" size={16} aria-hidden />}
                size="input"
              >
                {t("search")}
              </Button>
            </div>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <LocationField
              value={location}
              onChange={(next) => {
                setLocation(next);
                if (next.languageCode) setLanguage(next.languageCode);
              }}
              projectId={projectRef}
              disabled={busy}
              label={t("location")}
              messages={{
                city: t("locationCity"),
                clearSearch: t("locationClear"),
                countries: t("locationCountries"),
                noMatching: t("locationEmpty"),
                regionsAndCities: t("locationRegions"),
                region: t("locationRegion"),
                searching: t("locationLoading"),
              }}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel
                label={t("language")}
                className="text-[10px] uppercase tracking-[0.4px] text-fg-muted"
              />
              <MenuSelect
                ariaLabel={t("language")}
                size="input"
                searchable
                value={language}
                onChange={setLanguage}
                disabled={busy}
                options={serpLanguageCatalog.map((item) => ({
                  value: item.code,
                  label: item.label,
                }))}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel
                label={t("device")}
                className="text-[10px] uppercase tracking-[0.4px] text-fg-muted"
              />
              <SegmentedControl
                ariaLabel={t("device")}
                size="field"
                value={device}
                onChange={setDevice}
                disabled={busy}
                options={[
                  { value: "desktop", label: t("desktop") },
                  { value: "mobile", label: t("mobile") },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <PlaygroundProviders
              available={data.providers}
              history={history}
              selected={providers}
              busy={busy}
              onChange={(provider, checked) =>
                setProviders((values) =>
                  checked ? [...values, provider] : values.filter((value) => value !== provider),
                )
              }
            />
            <MenuSelect
              ariaLabel={t("depth")}
              size="input"
              triggerClassName="w-auto"
              value={String(depth)}
              onChange={(value) =>
                setDepth(Number(value) as import("@/lib/serp/constants").SerpDepth)
              }
              disabled={busy}
              options={[10, 20, 50, 100].map((value) => ({
                value: String(value),
                label: t("depthOption", { count: String(value) }),
              }))}
            />
          </div>
        </form>
        {!data.providers.some((item) => item.ready) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-bg-sunken p-3">
            <p className="m-0 text-xs text-fg-muted">{t("connectHelp")}</p>
            <Button asChild variant="outline" size="input">
              <a href={appPath(projectRef, "providers")}>{t("connect")}</a>
            </Button>
          </div>
        ) : null}
        {!data.canRun ? <p className="m-0 text-xs text-fg-muted">{t("readOnly")}</p> : null}
        {error ? (
          <p role="alert" className="m-0 text-sm text-fg-muted">
            {t(error)}
          </p>
        ) : null}
      </Card>
      <div className="flex min-w-0 items-center gap-3 overflow-x-auto">
        <SegmentedControl
          className="shrink-0"
          ariaLabel={t("view")}
          fitContent
          size="xs"
          value={view}
          onChange={setView}
          options={[
            { value: "serp", label: t("results") },
            { value: "json", label: t("normalizedJson"), tooltip: t("normalizedJsonHelp") },
            { value: "provider", label: t("providerJson"), tooltip: t("providerJsonHelp") },
          ]}
        />
      </div>
      {run ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-0 gap-1.5">
            <PlaygroundQueryScope run={run} />
            {savedShown ? (
              <p role="status" className="m-0 text-xs text-fg-muted">
                {t("savedShown")}
              </p>
            ) : null}
          </div>
          <Tooltip content={t("refreshHelp")} semantics="description">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>
              {t("refresh")}
            </Button>
          </Tooltip>
        </div>
      ) : null}
      {run && data.providers.some((item) => item.ready) ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !query.trim()}
            onClick={() => void preview(true)}
          >
            {t("freshSearch")}
          </Button>
        </div>
      ) : null}
      <SerpPlaygroundResults
        onResolved={refresh}
        readyProviders={data.providers
          .filter((provider) => provider.ready)
          .map((provider) => provider.provider)}
        selectedProviders={providers}
        onAddProvider={(provider) => {
          setProviders((values) => (values.includes(provider) ? values : [...values, provider]));
          document.getElementById("serp-query")?.focus({ preventScroll: true });
          document
            .getElementById("serp-query")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        providers={activeProviders}
        run={run}
        view={view}
        loading={pendingRun}
        projectRef={projectRef}
      />
      <PlaygroundReview
        review={review}
        busy={busy}
        onClose={() => setReview(null)}
        launch={() => void launch()}
        openPrevious={openPrevious}
      />
    </div>
  );
}
