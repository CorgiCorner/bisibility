"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type SiteAuditInput, siteAuditWorkerSchema } from "@/lib/site-audit/schema";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

export function SiteAuditForm({
  maxPages,
  canRun,
  busy,
  workerEnabled,
  run,
}: Readonly<{
  maxPages: number;
  canRun: boolean;
  busy: boolean;
  workerEnabled: boolean;
  run: (input: SiteAuditInput) => Promise<void>;
}>) {
  const t = useTranslations("projectSiteAudit");
  const limit = Math.max(1, maxPages);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(
      siteAuditWorkerSchema.extend({
        maxPages: siteAuditWorkerSchema.shape.maxPages.unwrap().max(limit).default(10),
      }),
    ),
    defaultValues: { maxPages: Math.min(10, limit) },
  });
  return (
    <form className="mt-4 grid gap-2" onSubmit={handleSubmit(run)}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-32 gap-1.5">
          <FieldLabel
            className="text-ui-body font-medium"
            htmlFor="audit-pages"
            label={t("pageLimit")}
          />
          <Input
            aria-invalid={Boolean(errors.maxPages)}
            aria-describedby={errors.maxPages ? "audit-pages-error" : undefined}
            id="audit-pages"
            type="number"
            min={1}
            max={limit}
            {...register("maxPages", { valueAsNumber: true })}
          />
        </div>
        <Button
          size="input"
          type="submit"
          startIcon={<MagnifyingGlassIcon size={15} weight="regular" />}
          loading={isSubmitting}
          loadingLabel={t("running")}
          disabled={!canRun || maxPages === 0 || busy}
        >
          {t("run")}
        </Button>
        <p className="m-0 pb-2 text-[11px] text-fg-muted">
          {t(workerEnabled ? "workerCost" : "cost")}
        </p>
      </div>
      <p className="m-0 text-xs text-fg-muted">{t("availableLimit", { limit })}</p>
      {errors.maxPages ? (
        <p id="audit-pages-error" className="m-0 text-ui-xs text-red-text" role="alert">
          {t("pageLimitError", { limit })}
        </p>
      ) : null}
    </form>
  );
}
