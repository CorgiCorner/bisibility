"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { setAssistantKillSwitch } from "@/lib/actions/assistant-kill-switch";
import type { AssistantGuardConfig } from "@/lib/assistant/guard-config";
import type { AssistantKillSwitch, KillSwitchTripNotice } from "@/lib/assistant/kill-switch";
import { KILL_SWITCH_REASON_MAX, killSwitchReasonSchema } from "@/lib/assistant/kill-switch-reason";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const LEVELS = ["on", "hosted_off", "all_off"] as const satisfies readonly AssistantKillSwitch[];

type LevelChange = { level: AssistantKillSwitch; reason: string };

/**
 * Instance admin card: the assistant kill switch (also the reset of a tripped spend breaker) and
 * the spending guards in force. A level change is applied with a required reason that goes into
 * the audit record. Guards change through the audited setAssistantGuard action. While the switch
 * was last raised by the AI usage dashboard, a banner says when, why and at what reported spend.
 */
export function AssistantSafeguards({
  level,
  guards,
  editable,
  trip = null,
}: Readonly<{
  level: AssistantKillSwitch;
  guards: AssistantGuardConfig;
  editable: boolean;
  trip?: KillSwitchTripNotice | null;
}>) {
  const t = useTranslations("instanceAdmin.features.assistant");
  const format = useFormatter();
  const usd = (cents: number) => format.number(cents / 100, { style: "currency", currency: "USD" });
  const id = useId();
  const reasonId = `${id}-reason`;
  const [current, setCurrent] = useState(level);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);
  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors },
  } = useForm<LevelChange>({
    defaultValues: { level, reason: "" },
    resolver: zodResolver(
      z.object({ level: z.enum(LEVELS), reason: killSwitchReasonSchema(t("reasonRequired")) }),
    ),
  });
  const [chosen, reason] = useWatch({ control, name: ["level", "reason"] });
  const locked = pending || !editable;
  const canApply = !locked && chosen !== current && (reason ?? "").trim().length > 0;

  function apply(change: LevelChange) {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await setAssistantKillSwitch(change.level, change.reason);
        if (result.ok) {
          setCurrent(change.level);
          reset({ level: change.level, reason: "" });
        }
        setStatus(result.ok ? "saved" : "failed");
      } catch {
        setStatus("failed");
      }
    });
  }

  const tripReason =
    trip?.reason === "provider_cap_exceeded"
      ? t("tripReasonCap")
      : trip?.reason === "manual_from_dashboard"
        ? t("tripReasonManual")
        : t("tripReasonUnknown");
  // A level applied here supersedes the trip, so the banner only describes the loaded state.
  const showTrip = current === level && current !== "on";

  const rows = [
    [t("platformHourly"), usd(guards["assistant.guard.platformHourlyCents"])],
    [t("platformDaily"), usd(guards["assistant.guard.platformDailyCents"])],
    [t("unsettled"), String(guards["assistant.guard.unsettledAttempts"])],
    [t("teamDaily"), usd(guards["assistant.guard.teamDailyCents"])],
    [t("teamConcurrent"), String(guards["assistant.guard.teamConcurrentTurns"])],
    [t("debtAlert"), usd(-guards["assistant.guard.debtAlertCents"])],
  ] as const;

  return (
    <Card className="grid gap-3">
      <h2 className="m-0 text-ui-section">{t("title")}</h2>
      <p className="m-0 text-ui-caption text-fg-muted">{t("description")}</p>
      {showTrip && trip ? (
        <InlineCallout role="status" tint="yellow">
          {t("tripBanner", {
            at: format.dateTime(new Date(trip.at), { dateStyle: "medium", timeStyle: "short" }),
            reason: tripReason,
          })}
          {trip.spendUsd && trip.capUsd
            ? ` ${t("tripSpend", {
                spend: usd(Math.round(Number(trip.spendUsd) * 100)),
                cap: usd(Math.round(Number(trip.capUsd) * 100)),
              })}`
            : null}
        </InlineCallout>
      ) : null}
      <form
        className="grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={handleSubmit(apply)}
      >
        <div className="grid min-w-0 gap-1.5">
          <FieldLabel className="text-sm font-medium text-fg" label={t("level")} />
          <Controller
            control={control}
            name="level"
            render={({ field }) => (
              <MenuSelect
                ariaLabel={t("level")}
                disabled={locked}
                onChange={(value) => {
                  const next = LEVELS.find((item) => item === value);
                  if (next) field.onChange(next);
                }}
                options={LEVELS.map((value) => ({ value, label: t(value) }))}
                size="input"
                value={field.value}
              />
            )}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <FieldLabel
            className="text-sm font-medium text-fg"
            htmlFor={reasonId}
            label={t("reason")}
          />
          <Input
            autoComplete="off"
            disabled={locked}
            id={reasonId}
            maxLength={KILL_SWITCH_REASON_MAX}
            placeholder={t("reasonPlaceholder")}
            {...register("reason")}
            aria-describedby={errors.reason ? `${reasonId}-error` : undefined}
            aria-invalid={errors.reason ? true : undefined}
          />
        </div>
        <Button className="justify-self-start" disabled={!canApply} size="input" type="submit">
          {t("apply")}
        </Button>
        {errors.reason ? (
          <p
            id={`${reasonId}-error`}
            role="alert"
            className="m-0 text-xs text-red-text sm:col-span-3"
          >
            {errors.reason.message}
          </p>
        ) : null}
      </form>
      {pending || status ? (
        <p
          className="m-0 text-ui-caption text-fg-muted"
          role={status === "failed" ? "alert" : "status"}
        >
          {pending ? t("saving") : status === "saved" ? t("saved") : t("failed")}
        </p>
      ) : null}
      <dl className="m-0 grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-ui-caption">
        {rows.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-fg-muted">{label}</dt>
            <dd className="m-0 text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
