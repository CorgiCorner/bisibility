"use client";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  freshnessSecondsText,
  type MeasurementFreshnessForm,
  measurementFreshnessFormSchema,
  parseFreshnessSeconds,
} from "@/lib/measurement-definitions/freshness-input";
import type {
  ConfigureHostPolicyInput,
  ConfigureHostPolicyResult,
  HostPolicySnapshot,
} from "@/lib/measurement-definitions/host-policy-contract";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

type Props = Readonly<{
  canEdit: boolean;
  projectId: string;
  snapshot: HostPolicySnapshot;
  configure: (input: ConfigureHostPolicyInput) => Promise<ConfigureHostPolicyResult>;
}>;
/** A named semantic configuration submit; blank freshness values explicitly preserve unknown. */
export function MeasurementPolicySettingsCard({ canEdit, projectId, snapshot, configure }: Props) {
  const t = useTranslations("projectSettingsTracking.measurementPolicy"),
    router = useRouter(),
    id = useId();
  const formId = `${id}-form`;
  const form = useForm<MeasurementFreshnessForm>({
    mode: "onChange",
    resolver: zodResolver(measurementFreshnessFormSchema),
    defaultValues: {
      manualSeconds: freshnessSecondsText(snapshot.config?.freshness.manualTtlMs ?? null),
      graceSeconds: freshnessSecondsText(snapshot.config?.freshness.cadenceGraceMs ?? null),
    },
  });
  const [notice, setNotice] = useState<
    "saved" | "conflict" | "unavailable" | "invalid" | "error" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const editable =
    canEdit && snapshot.policyEpoch !== null && snapshot.state !== "authority_unavailable";
  function save(fields: MeasurementFreshnessForm) {
    if (!editable || pending || snapshot.policyEpoch === null) return;
    const input: ConfigureHostPolicyInput = {
      projectId,
      expectedPolicyEpoch: snapshot.policyEpoch,
      confirmed: true,
      manualTtlMs: parseFreshnessSeconds(fields.manualSeconds),
      cadenceGraceMs: parseFreshnessSeconds(fields.graceSeconds),
    };
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await configure(input);
        setNotice(result.kind);
        if (result.kind === "saved" || result.kind === "conflict") router.refresh();
      } catch {
        setNotice("error");
      }
    });
  }
  return (
    <section id="measurement-policy">
      <SettingsCard
        title={t("title")}
        description={t("description")}
        showSave={false}
        action={
          editable ? (
            <Button form={formId} loading={pending} size="sm" type="submit">
              {t(snapshot.state === "ready" ? "save" : "configure")}
            </Button>
          ) : undefined
        }
      >
        <form id={formId} onSubmit={form.handleSubmit(save, () => setNotice("invalid"))}>
          <p className="m-0 mb-4 text-[13px] leading-5 text-fg-muted" role="status">
            {t(`states.${snapshot.state}`)}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { name: "manualSeconds", label: "manual" },
                { name: "graceSeconds", label: "grace" },
              ] as const
            ).map((field) => {
              const error = form.formState.errors[field.name];
              const value = form.getValues(field.name);
              return (
                <div className="min-w-0" key={field.name}>
                  <label
                    className="mb-1.5 block text-[13px] font-medium text-fg"
                    htmlFor={`${id}-${field.name}`}
                  >
                    {t(field.label)}
                  </label>
                  {editable ? (
                    <Input
                      {...form.register(field.name)}
                      aria-describedby={`${id}-${field.name}-help`}
                      aria-invalid={Boolean(error)}
                      disabled={pending}
                      id={`${id}-${field.name}`}
                      inputMode="decimal"
                      placeholder={t("unknown")}
                      type="text"
                    />
                  ) : (
                    <p className="m-0 text-[13px] text-fg">
                      {value ? t("seconds", { value: value }) : t("unknown")}
                    </p>
                  )}
                  <p
                    className={`m-0 mt-1.5 text-[12px] leading-5 ${error ? "text-red-text" : "text-fg-muted"}`}
                    id={`${id}-${field.name}-help`}
                  >
                    {error ? t("notices.invalid") : t(`${field.label}Help`)}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="m-0 mt-4 text-[12px] leading-5 text-fg-muted">{t("effect")}</p>
          {notice ? (
            <p
              className="m-0 mt-3 text-[13px] leading-5 text-fg"
              role={notice === "saved" ? "status" : "alert"}
            >
              {t(`notices.${notice}`)}
            </p>
          ) : null}
        </form>
      </SettingsCard>
    </section>
  );
}
