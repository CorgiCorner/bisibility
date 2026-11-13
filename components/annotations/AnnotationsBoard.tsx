"use client";

import { AnnotationDetail, AnnotationSourceRow } from "@/components/annotations/AnnotationDetail";
import { AnnotationLegendChip } from "@/components/annotations/AnnotationLegendChip";
import { AnnotationEntryRow } from "@/components/annotations/AnnotationMarkerBadge";
import { AnnotationNoteForm } from "@/components/annotations/AnnotationNoteForm";
import { AnnotationsRuler } from "@/components/annotations/AnnotationsRuler";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  markerToneContent,
  markerToneDeploy,
  markerToneNote,
  markerToneSearchEngine,
  markerToneSitemap,
} from "@/lib/annotations/marker-style";
import type { AnnotationCopy } from "@/lib/annotations/present";
import { presentAnnotations } from "@/lib/annotations/present";
import {
  type AnnotationFilter,
  type AnnotationKind,
  type AnnotationsView,
  annotationFilters,
  annotationMarkerByKind,
  visibleAnnotations,
} from "@/lib/annotations/types";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { annotationsBlocks } from "./annotations-layout";

const legend: readonly AnnotationKind[] = ["note", "google", "deploy", "content", "sitemap"];

type AnnotationsBoardProps = {
  canCreate: boolean;
  canDelete: boolean;
  developersHref: string;
  hideAutomatic: boolean;
  initialFilter: AnnotationFilter;
  initialSelected: string | null;
  locale: string;
  projectId: string;
  view: AnnotationsView;
};

export function AnnotationsBoard({
  canCreate,
  canDelete,
  developersHref,
  hideAutomatic,
  initialFilter: filter,
  initialSelected: selectedId,
  locale,
  projectId,
  view,
}: Readonly<AnnotationsBoardProps>) {
  const t = useTranslations("projectTimeline.annotations");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Filters and selection are server-owned URL state, including back/forward navigation.
  function navigate(change: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(change)) params.set(key, value);
    router.push(`${appPath(projectId, "annotations")}?${params}`, { scroll: false });
  }
  const formatDay = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: view.timeZone,
    }).format(new Date(iso));
  const copy = useMemo<AnnotationCopy>(() => {
    const sourceLabel = (source: string) =>
      source === "ga4"
        ? t("conversionSource.ga4")
        : source === "plausible"
          ? t("conversionSource.plausible")
          : t("conversionSource.none");
    return {
      byActor: (actor) => t("byActor", { actor }),
      contentFallback: t("contentFallback"),
      deindexedTitle: t("deindexedTitle"),
      deployFallback: t("deployFallback"),
      detailContent: t("detailContent"),
      detailDeindexed: t("detailDeindexed"),
      detailDeploy: t("detailDeploy"),
      detailGoogle: t("detailGoogle"),
      detailNote: t("detailNote"),
      detailSitemap: t("detailSitemap"),
      noteFallback: t("noteFallback"),
      primaryConversion: (from, to) =>
        t("primaryConversion", { from: sourceLabel(from), to: sourceLabel(to) }),
      sitemapTitle: (added, removed) => t("sitemapTitle", { added, removed }),
      sourceLabel: (kind) => t(`source.${kind}`),
    };
  }, [t]);
  const entries = presentAnnotations({
    copy,
    rangeLabel: (start, end) =>
      end
        ? t("rolloutRange", {
            end: formatDay(end),
            start: formatDay(start),
            status: t("rolloutComplete"),
          })
        : t("rolloutOpen"),
    signals: view.signals,
    updates: view.updates,
  });
  const visible = visibleAnnotations(entries, filter, hideAutomatic);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="flex flex-col gap-4" data-annotations-blocks={annotationsBlocks.join(" ")}>
      <p className="m-0 max-w-3xl text-sm text-fg-muted">{t("lead")}</p>
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold">{t("rulerTitle")}</h2>
          <p className="m-0 text-sm text-fg-muted">{t("rulerHint")}</p>
        </div>
        <AnnotationsRuler
          entries={visible}
          label={t("rulerAria")}
          locale={locale}
          timeZone={view.timeZone}
          windowEnd={view.now}
          windowStart={view.windowStart}
        />
        <div
          className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto"
          data-annotation-legend=""
        >
          {legend.map((kind) => (
            <AnnotationLegendChip
              className={
                kind === "note"
                  ? markerToneNote
                  : kind === "google"
                    ? markerToneSearchEngine
                    : kind === "deploy"
                      ? markerToneDeploy
                      : kind === "content"
                        ? markerToneContent
                        : markerToneSitemap
              }
              key={kind}
              label={t(`legend.${kind}`)}
              marker={annotationMarkerByKind[kind]}
              onClick={() => navigate({ filter: filter === kind ? "all" : kind })}
              pressed={filter === kind}
            />
          ))}
        </div>
      </Card>
      <AnnotationNoteForm
        canCreate={canCreate}
        now={view.now}
        projectId={projectId}
        timeZone={view.timeZone}
      />
      <fieldset
        aria-label={t("filterAria")}
        className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0"
      >
        {annotationFilters.map((key) => {
          const count =
            key === "all" ? entries.length : entries.filter((entry) => entry.kind === key).length;
          const selectedFilter = filter === key;
          return (
            <Button
              aria-pressed={selectedFilter}
              className={cn(
                "inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-control border px-3 text-sm font-semibold",
                selectedFilter
                  ? "border-border-control bg-accent-soft text-accent-text hover:border-accent focus-visible:border-accent"
                  : "border-border-control bg-bg-elev text-fg-muted hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text",
              )}
              key={key}
              onClick={() => navigate({ filter: key })}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t(`filter.${key}`)}
              <span className="text-fg-muted">{count}</span>
            </Button>
          );
        })}
        <Button
          aria-pressed={hideAutomatic}
          className={cn(
            "ms-auto inline-flex min-h-8 items-center rounded-control border px-3 text-sm font-semibold",
            hideAutomatic
              ? "border-border-control bg-accent-soft text-accent-text"
              : "border-border-control bg-bg-elev text-fg-muted",
          )}
          onClick={() => navigate({ auto: hideAutomatic ? "1" : "0" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          {hideAutomatic ? t("showAutomatic") : t("hideAutomatic")}
        </Button>
      </fieldset>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden p-0" data-annotation-list="">
          {visible.length === 0 ? (
            <p className="m-0 px-4 py-4 text-sm text-fg-muted">{t("empty")}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {visible.map((entry) => {
                const active = selected?.id === entry.id;
                return (
                  <li
                    className="border-b border-border last:border-b-0"
                    key={entry.id}
                    id={`signal-${entry.id}`}
                  >
                    <Button
                      aria-pressed={active}
                      className={cn(
                        "flex h-auto w-full min-w-0 items-start justify-start gap-3 rounded-none px-4 py-3 text-left font-normal focus-visible:-outline-offset-2",
                        active ? "bg-accent-soft" : "bg-bg-elev",
                      )}
                      onClick={() => navigate({ q: entry.id })}
                      type="button"
                      variant="ghost"
                    >
                      <span className="min-w-0 flex-1">
                        <AnnotationEntryRow
                          marker={entry.marker}
                          source={
                            <>
                              {entry.sourceLabel}
                              {entry.subtitle ? ` · ${entry.subtitle}` : ""}
                            </>
                          }
                          title={entry.title}
                        />
                      </span>
                      <span className="shrink-0 text-ui-caption text-fg-muted">
                        {formatDay(entry.happenedAt)}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <AnnotationDetail canDelete={canDelete} entry={selected} projectId={projectId} />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-base font-semibold">{t("sourcesTitle")}</h2>
        <AnnotationSourceRow
          detail={t("googleSourceDetail")}
          marker="G"
          status={t("statusOn")}
          title={t("legend.google")}
        />
        <AnnotationSourceRow
          detail={t("sitemapSourceDetail")}
          marker="S"
          status={t("statusOn")}
          title={t("sitemapSource")}
        />
        <AnnotationSourceRow
          detail={t("deploySourceDetail")}
          href={developersHref}
          hrefLabel={t("connect")}
          marker="D"
          title={t("legend.deploy")}
        />
        <AnnotationSourceRow
          detail={t("contentSourceDetail")}
          href={developersHref}
          hrefLabel={t("connect")}
          marker="C"
          title={t("contentSource")}
        />
      </Card>
    </div>
  );
}
