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
  if (maxPages <= 0) {
    return (
      <p className="m-0 mt-4 text-ui-caption text-fg-muted" role="status">
        {t("budgetEmpty")}
      </p>
    );
  }
  return (
    <AuditFields
      busy={busy}
      canRun={canRun}
      limit={maxPages}
      run={run}
      workerEnabled={workerEnabled}
    />
  );
}

function AuditFields({
  busy,
  canRun,
  limit,
  run,
  workerEnabled,
}: Readonly<{
  busy: boolean;
  canRun: boolean;
  limit: number;
  run: (input: SiteAuditInput) => Promise<void>;
  workerEnabled: boolean;
}>) {
  const t = useTranslations("projectSiteAudit");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm({
    mode: "onChange",
    resolver: zodResolver(
      siteAuditWorkerSchema.extend({
        maxPages: siteAuditWorkerSchema.shape.maxPages.unwrap().max(limit).default(10),
      }),
    ),
    defaultValues: { maxPages: Math.min(10, limit) },
  });
  const pages = register("maxPages", { valueAsNumber: true });
  const value = watch("maxPages");
  const outOfRange = !Number.isInteger(value) || value < 1 || value > limit;
  const disabled = !canRun || busy;
  return (
    <form className="mt-4 grid gap-2" onSubmit={handleSubmit(run)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid w-32 gap-1.5">
          <FieldLabel
            className="text-ui-body font-medium"
            htmlFor="audit-pages"
            label={t("pageLimit")}
          />
          <Input
            aria-describedby={outOfRange ? "audit-pages-error" : "audit-pages-help"}
            aria-invalid={outOfRange}
            id="audit-pages"
            max={limit}
            min={1}
            step={1}
            type="number"
            {...pages}
            onBlur={(event) => {
              pages.onBlur(event);
              const next = event.currentTarget.valueAsNumber;
              const clamped = Number.isFinite(next)
                ? Math.min(limit, Math.max(1, Math.trunc(next)))
                : 1;
              if (clamped !== next) setValue("maxPages", clamped, { shouldValidate: true });
            }}
          />
        </div>
        <Button
          disabled={disabled}
          onClick={() => setValue("maxPages", limit, { shouldValidate: true })}
          size="input"
          type="button"
          variant="secondary"
        >
          {t("maxAction")}
        </Button>
        <Button
          disabled={disabled}
          loading={isSubmitting}
          loadingLabel={t("running")}
          size="input"
          startIcon={<MagnifyingGlassIcon size={15} weight="regular" />}
          type="submit"
        >
          {t("run")}
        </Button>
      </div>
      {outOfRange ? (
        <p className="m-0 text-ui-caption text-red-text" id="audit-pages-error" role="alert">
          {t("pageLimitError", { limit })}
        </p>
      ) : null}
      <p className="m-0 text-ui-caption text-fg-muted" id="audit-pages-help">
        {t(workerEnabled ? "workerCost" : "cost")}
      </p>
    </form>
  );
}
