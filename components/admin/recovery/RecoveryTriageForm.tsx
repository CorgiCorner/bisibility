"use client";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { updateRecoveryTriageAction } from "@/lib/actions/metering-recovery";
import {
  type RecoveryCase,
  type RecoveryUiError,
  TRIAGE_STATUSES,
} from "@/lib/metering/recovery/contract";
import { type TriageInput, triageInputSchema } from "@/lib/metering/recovery/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

export function RecoveryTriageForm({ row, onSaved }: { row: RecoveryCase; onSaved: () => void }) {
  const t = useTranslations("instanceAdmin.recovery"),
    [busy, start] = useTransition(),
    [error, setError] = useState<RecoveryUiError | null>(null);
  const form = useForm<TriageInput>({
    resolver: zodResolver(triageInputSchema),
    defaultValues: {
      caseToken: row.token,
      expectedVersion: row.version,
      status: row.triage.status,
      reason: row.triage.reason as TriageInput["reason"],
      assignToMe: row.triage.assignedToMe,
      snoozedUntil: row.triage.snoozedUntil,
    },
  });
  const status = form.watch("status");
  function submit(value: TriageInput) {
    start(async () => {
      const result = await updateRecoveryTriageAction(value);
      if (result.ok) onSaved();
      else setError(result.code);
    });
  }
  return (
    <form onSubmit={form.handleSubmit(submit, () => setError("invalid"))} className="grid gap-4">
      <h3 className="text-sm font-semibold">{t("triage")}</h3>
      <Controller
        control={form.control}
        name="status"
        render={({ field }) => (
          <MenuSelect
            ariaLabel={t("triage")}
            disabled={busy}
            value={field.value}
            options={TRIAGE_STATUSES.map((value) => ({ value, label: t(`triageStates.${value}`) }))}
            onChange={(value) => {
              field.onChange(value);
              form.setValue(
                "snoozedUntil",
                value === "waiting_evidence" ? new Date(Date.now() + 86400000).toISOString() : null,
              );
              if (value === "waiting_evidence" || value === "escalated")
                form.setValue("reason", "missing_proof");
            }}
          />
        )}
      />
      <Controller
        control={form.control}
        name="reason"
        render={({ field }) => (
          <MenuSelect
            ariaLabel={t("reason")}
            disabled={busy}
            value={field.value ?? "none"}
            options={(
              [
                "none",
                "investigating",
                "provider_support",
                "waiting_export",
                "missing_proof",
              ] as const
            ).map((value) => ({ value, label: t(`reasons.${value}`) }))}
            onChange={(value) => field.onChange(value === "none" ? null : value)}
          />
        )}
      />
      {status === "waiting_evidence" && (
        <Controller
          control={form.control}
          name="snoozedUntil"
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("due")}
              disabled={busy}
              value={String(Math.round((Date.parse(field.value ?? "") - Date.now()) / 3600000))}
              options={["1", "24", "168"].map((value) => ({
                value,
                label: t("hours", { count: Number(value) }),
              }))}
              onChange={(value) =>
                field.onChange(new Date(Date.now() + Number(value) * 3600000).toISOString())
              }
            />
          )}
        />
      )}
      <Checkbox label={t("assign")} disabled={busy} {...form.register("assignToMe")} />
      <p className="text-xs leading-relaxed text-fg-muted">{t("triageNote")}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {t("save")}
      </Button>
    </form>
  );
}
