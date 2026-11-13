"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { type CapacityFailure, capacityActionClient } from "@/lib/capacity/action";
import type { CoreWebVitalsCardModel, PageVitalsActionResult } from "@/lib/pagespeed/view";
import { appPath } from "@/lib/routing/app-path";
import type { SavedSiteAudit, SiteAuditInput, SiteAuditPage } from "@/lib/site-audit/schema";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { CoreWebVitalsCard } from "./CoreWebVitalsCard";
import { SiteAuditForm } from "./SiteAuditForm";
import { SiteAuditResultsLoading } from "./SiteAuditLoading";
import { SiteAuditResults } from "./SiteAuditResults";
import { useSiteAuditProgress } from "./useSiteAuditProgress";
export type SiteAuditWorkspaceProps = {
  domain: string;
  projectId: string;
  canRun: boolean;
  workerEnabled?: boolean;
  maxPages?: number;
  initial: SavedSiteAudit | null;
  history: { id: string; title: string; createdAt: string }[];
  runAction: (
    input: SiteAuditInput & { projectId: string },
  ) => Promise<SavedSiteAudit | CapacityFailure>;
  readAction: (input: { projectId: string; reportId: string }) => Promise<SavedSiteAudit | null>;
  cancelAction?: (input: { projectId: string; reportId: string }) => Promise<unknown>;
  resumeAction?: (input: { projectId: string; reportId: string }) => Promise<unknown>;
  pagesAction?: (input: {
    projectId: string;
    reportId: string;
    offset: number;
    limit: number;
  }) => Promise<{ pages: SiteAuditPage[]; offset: number; nextOffset: number | null } | null>;
  vitals?: {
    checkAction: (input: { projectId: string }) => Promise<PageVitalsActionResult>;
    model: CoreWebVitalsCardModel;
  };
};
export function SiteAuditWorkspace(props: Readonly<SiteAuditWorkspaceProps>) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Workspace {...props} />
    </QueryClientProvider>
  );
}
function Workspace({
  domain,
  projectId,
  canRun,
  workerEnabled = false,
  maxPages = 15,
  initial,
  history,
  runAction,
  readAction,
  cancelAction,
  resumeAction,
  pagesAction,
  vitals,
}: Readonly<SiteAuditWorkspaceProps>) {
  const t = useTranslations("projectSiteAudit");
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [changingRun, setChangingRun] = useState(false);
  const [page, setPage] = useState<{
    reportId: string;
    pages: SiteAuditPage[];
    offset: number;
    nextOffset: number | null;
  } | null>(null);
  const { saved, setSaved, cancelPending, refresh } = useSiteAuditProgress({
    projectId,
    initial,
    readAction,
    paused: changingRun,
  });
  const active = ["queued", "running"].includes(saved?.run?.state ?? "");
  const [isSubmitting, setSubmitting] = useState(false);
  async function run(input: SiteAuditInput) {
    setSubmitting(true);
    setError(null);
    try {
      setSaved(await capacityActionClient(runAction)({ ...input, projectId }));
      setPage(null);
      router.refresh();
    } catch (error) {
      if (!isCapacityDenial(error)) setError(t("errorRun"));
    } finally {
      setSubmitting(false);
    }
  }
  async function open(reportId: string) {
    setLoadingHistory(true);
    setError(null);
    try {
      const report = await readAction({ projectId, reportId });
      if (!report) throw new Error(t("errorLoad"));
      setSaved(report);
      setPage(null);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoadingHistory(false);
    }
  }
  async function changeRun(action: NonNullable<typeof cancelAction>) {
    if (!saved) return;
    const reportId = saved.id;
    setChangingRun(true);
    setError(null);
    try {
      await cancelPending();
      await capacityActionClient(action)({ projectId, reportId });
      const report = await refresh();
      if (!report) throw new Error("Missing audit.");
      setSaved(report);
      setPage(null);
    } catch (error) {
      if (!isCapacityDenial(error)) setError(t("errorRun"));
    } finally {
      setChangingRun(false);
    }
  }
  async function loadPage(offset: number) {
    if (!saved || !pagesAction) return;
    setChangingRun(true);
    try {
      const result = await pagesAction({ projectId, reportId: saved.id, offset, limit: 15 });
      if (!result) throw new Error("Missing audit.");
      setPage({ ...result, reportId: saved.id });
    } catch {
      setError(t("errorLoad"));
    } finally {
      setChangingRun(false);
    }
  }
  const currentPage = page?.reportId === saved?.id ? page : null;
  const nextOffset = currentPage
    ? currentPage.nextOffset
    : (saved?.run?.pagesCrawled ?? 0) > 15
      ? 15
      : null;
  const knownState =
    (["queued", "running", "paused", "complete", "stopped", "failed", "cancelled"] as const).find(
      (state) => state === saved?.run?.state,
    ) ?? "unknown";
  return (
    <section className="grid min-w-0 gap-4" aria-label={t("heading")}>
      <Card>
        <p className="m-0 text-[13px] text-fg-muted">{t("description", { domain })}</p>
        <SiteAuditForm
          maxPages={maxPages}
          canRun={canRun}
          busy={loadingHistory || changingRun}
          workerEnabled={workerEnabled}
          run={run}
        />
        {!canRun ? <p className="mb-0 mt-3 text-[12px] text-fg-muted">{t("readOnly")}</p> : null}
      </Card>
      {history.length ? (
        <Card>
          <h2 className="m-0 text-[14px] font-semibold">{t("history")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {history.map((report) => (
              <Button
                size="xs"
                variant="secondary"
                key={report.id}
                disabled={isSubmitting || loadingHistory || changingRun}
                onClick={() => void open(report.id)}
              >
                {date(report.createdAt)}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
      {error ? (
        <Card className="text-[13px] text-red-text" role="alert">
          {error}
        </Card>
      ) : null}
      {saved?.run ? (
        <Card>
          <p className="m-0 text-[13px] text-fg-muted" role="status">
            {t("runProgress", {
              state: t(`runStates.${knownState}`),
              pages: saved.run.pagesCrawled,
              budget: saved.run.budgetPages,
            })}
          </p>
          {saved.run.stopReason === "unverified_cap" ? (
            <p className="mb-0 mt-3 text-[13px]">
              <Link href={appPath(projectId, "settings", "general")}>{t("verifyDomain")}</Link>
            </p>
          ) : null}
          {canRun &&
          ((active && cancelAction) ||
            (!active && workerEnabled && saved.run.state !== "complete" && resumeAction)) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {active && cancelAction ? (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={changingRun}
                  onClick={() => void changeRun(cancelAction)}
                >
                  {t("cancelRun")}
                </Button>
              ) : null}
              {!active && workerEnabled && saved.run.state !== "complete" && resumeAction ? (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={changingRun}
                  onClick={() => void changeRun(resumeAction)}
                >
                  {t("resumeRun")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
      {isSubmitting || loadingHistory ? (
        <SiteAuditResultsLoading
          label={isSubmitting ? t("loadingRun") : t("loadingHistory")}
          rows={saved?.result.pages.length}
        />
      ) : saved ? (
        <>
          <p className="m-0 text-[11px] text-fg-muted">
            {t("saved", { time: date(saved.createdAt), stored: saved.cached ? t("stored") : "" })}
          </p>
          <SiteAuditResults
            result={currentPage ? { ...saved.result, pages: currentPage.pages } : saved.result}
            showPartial={!active}
          />
          {saved.run && pagesAction && (currentPage || nextOffset !== null) ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="xs"
                variant="secondary"
                disabled={changingRun || !currentPage?.offset}
                onClick={() => void loadPage(Math.max(0, (currentPage?.offset ?? 0) - 15))}
              >
                {t("previousPages")}
              </Button>
              <Button
                size="xs"
                variant="secondary"
                disabled={changingRun || nextOffset === null}
                onClick={() => nextOffset !== null && void loadPage(nextOffset)}
              >
                {t("nextPages")}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<MagnifyingGlassIcon size={24} weight="regular" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          bullets={[t("bullets.0"), t("bullets.1"), t("bullets.2")]}
        />
      )}
      {vitals ? (
        <CoreWebVitalsCard
          canCheck={canRun}
          checkAction={vitals.checkAction}
          model={vitals.model}
          projectId={projectId}
        />
      ) : null}
    </section>
  );
}

function isCapacityDenial(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "plan_limit_reached" || error.code === "subscription_required")
  );
}
