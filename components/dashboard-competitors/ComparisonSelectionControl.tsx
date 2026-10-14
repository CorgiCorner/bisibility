"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { DashboardComparisonContext } from "@/lib/dashboard-competitors/model";
import {
  readDashboardPreference,
  saveDashboardComparisonSelection,
} from "@/lib/project-surface-preferences/dashboard-actions";
import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";
import { appPath } from "@/lib/routing/app-path";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export function ComparisonSelectionControl({
  comparison,
  preference,
  standalone = false,
}: {
  comparison: DashboardComparisonContext;
  preference: DashboardSurfacePreference;
  standalone?: boolean;
}) {
  const t = useTranslations("shared.dashboardComparison");
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  const [message, setMessage] = useState("");
  const [expectedRevision, setExpectedRevision] = useState(preference.revision);
  const [retainedSelection, setRetainedSelection] = useState(
    preference.presentation.competitorSelection ?? null,
  );
  const [conflict, setConflict] = useState(false);
  const [pending, start] = useTransition();
  function navigate(value: string) {
    const params = new URLSearchParams(search.toString());
    params.set("dashboardView", "competitors");
    params.set("dashboardCompetitorView", value);
    const choice = comparison.choices.find((choice) => JSON.stringify(choice.selection) === value);
    if (choice) {
      params.set("device", choice.scope.device);
      params.set("market", choice.scope.locationId);
      if (choice.tag) params.set("tag", choice.tag);
    }
    router.replace(`${pathname}?${params}`);
  }
  function remember(clear: boolean) {
    start(async () => {
      try {
        const result = await saveDashboardComparisonSelection({
          projectId: preference.projectId,
          expectedRevision,
          selection: clear ? null : comparison.selection,
        });
        if (!result.ok) {
          setConflict(result.error.status === 409);
          setMessage(t(result.error.status === 409 ? "conflict" : "saveError"));
          return;
        }
        setConflict(false);
        setExpectedRevision(result.value.revision);
        setRetainedSelection(result.value.presentation.competitorSelection ?? null);
        setMessage(t(clear ? "cleared" : "saved"));
        if (clear) navigate("");
        router.refresh();
      } catch {
        setMessage(t("saveError"));
      }
    });
  }
  function reloadRevision() {
    start(async () => {
      try {
        const result = await readDashboardPreference(preference.projectId);
        if (
          !result.ok ||
          result.value.projectId !== preference.projectId ||
          result.value.notice ||
          result.value.revision <= expectedRevision
        ) {
          setMessage(t("reloadUnavailable"));
          return;
        }
        setExpectedRevision(result.value.revision);
        setRetainedSelection(result.value.presentation.competitorSelection ?? null);
        setConflict(false);
        setMessage(t("reviewRevision", { revision: String(result.value.revision) }));
      } catch {
        setMessage(t("reloadUnavailable"));
      }
    });
  }
  if (!comparison.choices.length && comparison.state !== "ready" && !retainedSelection) {
    const empty = (
      <>
        <EmptyState
          compact
          title={t(comparison.state === "missing" ? "emptyTitle" : "selection")}
          description={t(
            comparison.state === "missing" ? "emptyDescription" : `state.${comparison.state}`,
          )}
          action={
            <Button size="sm" href={appPath(preference.projectId, "competitors")}>
              {t("configureComparison")}
            </Button>
          }
        />
        <p role="status" aria-live="polite" className="sr-only">
          {message}
        </p>
      </>
    );
    return standalone ? <Card>{empty}</Card> : empty;
  }
  const remembered =
    comparison.selection?.viewId === retainedSelection?.viewId &&
    comparison.selection?.revision === retainedSelection?.revision;
  const mutable = !preference.notice && !conflict;
  const content = (
    <section
      aria-label={t("selection")}
      className="flex min-w-0 flex-col items-start gap-2 text-left"
    >
      {standalone ? (
        <h2 className="m-0 text-[16px] font-semibold leading-5">{t("selection")}</h2>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {comparison.choices.length > 0 ? (
          <MenuSelect
            compact
            triggerClassName="max-w-full font-normal"
            searchable
            ariaLabel={t("selection")}
            disabled={pending}
            value={comparison.selection ? JSON.stringify(comparison.selection) : ""}
            options={[
              { value: "", label: t("choose") },
              ...comparison.choices.map((choice) => ({
                value: JSON.stringify(choice.selection),
                label: choice.name,
                secondary: `${choice.locationLabel} / ${choice.languageLabel} / ${t(choice.scope.device)}`,
              })),
            ]}
            onChange={navigate}
          />
        ) : null}
        {mutable && comparison.state === "ready" && comparison.selection && !remembered ? (
          <Button
            size="sm"
            style={{ fontWeight: 400 }}
            variant="outline"
            disabled={pending}
            onClick={() => remember(false)}
          >
            {t("remember")}
          </Button>
        ) : null}
        {mutable && retainedSelection ? (
          <Button
            size="sm"
            style={{ fontWeight: 400 }}
            variant="ghost"
            disabled={pending}
            onClick={() => remember(true)}
          >
            {t("clear")}
          </Button>
        ) : null}
        {comparison.choices.length === 0 ? (
          <Button size="sm" variant="outline" href={appPath(preference.projectId, "competitors")}>
            {t("configureComparison")}
          </Button>
        ) : null}
      </div>
      {comparison.state !== "ready" ? (
        <p role="status" className="m-0 text-[12.5px] leading-5 text-fg-muted">
          {t(`state.${comparison.state}`)}
        </p>
      ) : null}
      {conflict ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={reloadRevision}>
          {t("reloadRevision")}
        </Button>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={message ? "m-0 text-[12.5px] leading-5 text-fg-muted" : "sr-only"}
      >
        {message}
      </p>
    </section>
  );
  return standalone ? <Card>{content}</Card> : content;
}
