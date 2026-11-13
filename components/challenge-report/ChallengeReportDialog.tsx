"use client";

import { ReportComposer } from "@/components/agent-reports/ReportComposer";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { type ManualReportInput, manualReportSchema } from "@/lib/agent-reports/manual-model";
import {
  addDays,
  CHALLENGE_LENGTHS,
  isDateKey,
  MAX_CHALLENGE_DAYS,
  periodDays,
} from "@/lib/challenge-report/period";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { appPath } from "@/lib/routing/app-path";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { z } from "zod";

const performanceForm = z
  .object({
    start: z.string().refine(isDateKey),
    end: z.string().refine(isDateKey),
    includeWork: z.boolean(),
    title: z.string().trim().min(1).max(160),
  })
  .refine(
    ({ start, end }) => {
      const days = periodDays(start, end);
      return days >= 1 && days <= MAX_CHALLENGE_DAYS;
    },
    { path: ["end"] },
  );

type PerformanceForm = z.infer<typeof performanceForm>;
type ReportMode = "performance" | "written";

export function ChallengeReportDialog({
  createAction,
  defaultStart,
  domain,
  initialOpen = false,
  journey = false,
  projectId,
  saveAction,
  today,
  workAvailable = false,
}: Readonly<{
  createAction: (input: unknown) => Promise<{ id: string; ok: true } | { ok: false }>;
  defaultStart: string;
  domain: string;
  initialOpen?: boolean;
  journey?: boolean;
  projectId: string;
  saveAction: (input: unknown) => Promise<{ id: string }>;
  today: string;
  workAvailable?: boolean;
}>) {
  const t = useTranslations("challengeReport");
  const workspace = useTranslations("agentWorkspace");
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(initialOpen);
  const [mode, setMode] = useState<ReportMode>("performance");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<{ id: string; payload: string } | null>(null);

  function defaults(): PerformanceForm {
    const since = periodDays(defaultStart, today);
    return {
      start: since >= 1 && since <= MAX_CHALLENGE_DAYS ? defaultStart : addDays(today, -29),
      end: today,
      includeWork: journey,
      title: t(journey ? "journeyTitle" : "performanceTitle", { domain }).slice(0, 160),
    };
  }
  const performanceFormState = useZodForm<PerformanceForm>(performanceForm, {
    defaultValues: defaults(),
  });
  const writtenForm = useZodForm<ManualReportInput>(manualReportSchema, {
    defaultValues: { title: "", analysis: "" },
  });
  const busy =
    saving || performanceFormState.formState.isSubmitting || writtenForm.formState.isSubmitting;

  async function persist(
    values: PerformanceForm | ManualReportInput,
    run: (id: string) => Promise<string>,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    const payload = JSON.stringify(values);
    if (request.current?.payload !== payload) {
      request.current = { id: crypto.randomUUID(), payload };
    }
    try {
      const id = await run(request.current.id);
      router.push(appPath(projectId, "agent-reports", id));
    } catch {
      setFailed(true);
      setSaving(false);
      inFlight.current = false;
    }
  }

  async function create(values: PerformanceForm) {
    await persist(values, async (id) => {
      const result = await createAction({
        projectId,
        title: values.title,
        start: values.start,
        days: periodDays(values.start, values.end),
        includeWork: values.includeWork,
        journey,
        requestId: id,
      });
      if (!result.ok) throw new Error("Could not create report");
      return result.id;
    });
  }

  function selectMode(value: ReportMode) {
    setMode(value);
    setFailed(false);
    request.current = null;
  }

  function openDialog() {
    selectMode("performance");
    performanceFormState.reset(defaults());
    setOpen(true);
  }

  const written = mode === "written";
  const activeRange = periodDays(
    performanceFormState.watch("start"),
    performanceFormState.watch("end"),
  );
  const preset = CHALLENGE_LENGTHS.find((days) => days === activeRange);
  return (
    <>
      <Button
        onClick={openDialog}
        size="sm"
        startIcon={<PlusIcon aria-hidden size={15} weight="regular" />}
      >
        {journey ? t("journeyCreate") : t("newReport")}
      </Button>
      <Modal
        dismissDisabled={busy}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={() => setOpen(false)} size="input" variant="secondary">
              {t("cancel")}
            </Button>
            <Button
              form={formId}
              loading={busy}
              loadingLabel={t(written ? "savingReport" : "creatingReport")}
              size="input"
              type="submit"
            >
              {written ? workspace("saveReport") : t("create")}
            </Button>
          </div>
        }
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        open={open}
        size="lg"
        title={journey ? t("journeyCreate") : t("newReport")}
      >
        {!journey ? (
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["performance", "written"] as const).map((choice) => (
              <Button
                aria-pressed={mode === choice}
                className="h-auto min-w-0 justify-start whitespace-normal text-left"
                disabled={busy}
                key={choice}
                onClick={() => selectMode(choice)}
                size="input"
                variant={mode === choice ? "secondary" : "outline"}
              >
                <span className="grid gap-1 py-2">
                  <span>{t(`${choice}Choice`)}</span>
                  <span className="text-ui-caption font-normal text-fg-muted">
                    {t(`${choice}Help`)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : null}
        {written ? (
          <form
            className="grid gap-4"
            id={formId}
            onSubmit={writtenForm.handleSubmit((values) =>
              persist(
                values,
                async (id) => (await saveAction({ ...values, projectId, requestId: id })).id,
              ),
            )}
          >
            <ReportComposer disabled={busy} form={writtenForm} />
          </form>
        ) : (
          <form
            className="grid gap-4"
            id={formId}
            onSubmit={performanceFormState.handleSubmit(create)}
          >
            <FormField htmlFor={`${formId}-title`} label={workspace("reportTitle")}>
              <Input
                {...performanceFormState.register("title")}
                disabled={busy}
                id={`${formId}-title`}
                maxLength={160}
              />
            </FormField>
            {!journey ? (
              <FormField label={t("length")}>
                <MenuSelect
                  ariaLabel={t("length")}
                  disabled={busy}
                  onChange={(value) => {
                    if (value === "custom") return;
                    performanceFormState.setValue("end", today);
                    performanceFormState.setValue("start", addDays(today, 1 - Number(value)));
                  }}
                  options={[
                    { label: t("customRange"), value: "custom" },
                    ...CHALLENGE_LENGTHS.map((days) => ({
                      label: t("lengthOption", { days }),
                      value: String(days),
                    })),
                  ]}
                  size="input"
                  value={preset ? String(preset) : "custom"}
                />
              </FormField>
            ) : null}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&_input::-webkit-datetime-edit]:leading-none">
              <FormField htmlFor={`${formId}-start`} label={t("start")}>
                <Input
                  {...performanceFormState.register("start")}
                  disabled={busy}
                  id={`${formId}-start`}
                  max={today}
                  readOnly={journey}
                  type="date"
                />
              </FormField>
              <FormField htmlFor={`${formId}-end`} label={t("end")}>
                <Input
                  {...performanceFormState.register("end")}
                  disabled={busy}
                  id={`${formId}-end`}
                  max={today}
                  readOnly={journey}
                  type="date"
                />
              </FormField>
            </div>
            {workAvailable && !journey ? (
              <Switch
                {...performanceFormState.register("includeWork")}
                disabled={busy}
                label={t("tiles.activeDays")}
                description={t("scopeProject")}
              />
            ) : null}
            {Object.keys(performanceFormState.formState.errors).length ? (
              <p className="m-0 text-ui-caption text-red-text" role="alert">
                {t("rangeValidation", { days: MAX_CHALLENGE_DAYS })}
              </p>
            ) : null}
          </form>
        )}
        {failed ? (
          <p className="mb-0 mt-4 text-ui-caption text-red-text" role="alert">
            {t("failed")}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
