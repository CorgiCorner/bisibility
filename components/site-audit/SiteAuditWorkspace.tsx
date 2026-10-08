"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { SavedSiteAudit, SiteAuditInput } from "@/lib/site-audit/schema";
import { siteAuditSchema } from "@/lib/site-audit/schema";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { SiteAuditResults } from "./SiteAuditResults";

export type SiteAuditWorkspaceProps = {
  domain: string;
  projectId: string;
  canRun: boolean;
  initial: SavedSiteAudit | null;
  history: { id: string; title: string; createdAt: string }[];
  runAction: (input: SiteAuditInput & { projectId: string }) => Promise<SavedSiteAudit>;
  readAction: (input: { projectId: string; reportId: string }) => Promise<SavedSiteAudit | null>;
};
export function SiteAuditWorkspace({
  domain,
  projectId,
  canRun,
  initial,
  history,
  runAction,
  readAction,
}: Readonly<SiteAuditWorkspaceProps>) {
  const t = useTranslations("projectSiteAudit");
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(siteAuditSchema), defaultValues: { maxPages: 10 } });
  async function run(input: SiteAuditInput) {
    setError(null);
    try {
      setSaved(await runAction({ ...input, projectId }));
      router.refresh();
    } catch {
      setError(t("errorRun"));
    }
  }
  async function open(reportId: string) {
    setLoadingHistory(true);
    setError(null);
    try {
      const report = await readAction({ projectId, reportId });
      if (!report) throw new Error(t("errorLoad"));
      setSaved(report);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoadingHistory(false);
    }
  }
  return (
    <section className="grid min-w-0 gap-4" aria-label={t("heading")}>
      <Card>
        <p className="m-0 text-[13px] text-fg-muted">{t("description", { domain })}</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleSubmit(run)}>
          <div className="w-32">
            <FieldLabel htmlFor="audit-pages" label={t("pageLimit")} />
            <Input
              id="audit-pages"
              type="number"
              min={1}
              max={15}
              {...register("maxPages", { valueAsNumber: true })}
            />
            {errors.maxPages ? (
              <p className="text-[11px] text-red-text" role="alert">
                {t("pageLimitError")}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            startIcon={<MagnifyingGlassIcon size={15} weight="regular" />}
            loading={isSubmitting}
            loadingLabel={t("running")}
            disabled={!canRun || loadingHistory}
          >
            {t("run")}
          </Button>
          <p className="m-0 pb-2 text-[11px] text-fg-muted">{t("cost")}</p>
        </form>
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
                disabled={isSubmitting || loadingHistory}
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
      {isSubmitting || loadingHistory ? (
        <Card aria-busy="true" role="status">
          <p className="m-0 text-[13px] text-fg-muted">
            {isSubmitting ? t("loadingRun") : t("loadingHistory")}
          </p>
        </Card>
      ) : saved ? (
        <>
          <p className="m-0 text-[11px] text-fg-muted">
            {t("saved", { time: date(saved.createdAt), stored: saved.cached ? t("stored") : "" })}
          </p>
          <SiteAuditResults result={saved.result} />
        </>
      ) : (
        <EmptyState
          icon={<MagnifyingGlassIcon size={24} weight="regular" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          bullets={[t("bullets.0"), t("bullets.1"), t("bullets.2")]}
        />
      )}
    </section>
  );
}
