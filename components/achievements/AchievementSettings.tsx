"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Switch } from "@/components/ui/Switch";
import {
  type AchievementPreferences,
  type AchievementView,
  preferenceSchema,
} from "@/lib/achievements/schema";
import { saveAchievementPreferences } from "@/lib/actions/achievements";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
export function AchievementSettings({
  view,
  onRefresh,
}: {
  view: AchievementView;
  onRefresh: () => void;
}) {
  const t = useTranslations("account.achievements");
  const form = useForm<AchievementPreferences, unknown, AchievementPreferences>({
    resolver: zodResolver(preferenceSchema),
    defaultValues: {
      enabled: view.enabled,
      showHeader: view.showHeader,
      emailEnabled: view.emailEnabled,
      timeZone: view.timeZone,
      revision: view.revision,
      restartCalendar: false,
    },
  });
  const [pending, startTransition] = useTransition(),
    [message, setMessage] = useState<"saved" | "error" | "conflict" | "restartRequired" | null>(
      null,
    );
  const zones = [...new Set([view.timeZone, "UTC", ...Intl.supportedValuesOf("timeZone")])].map(
    (value) => ({ value, label: value }),
  );
  const zoneChanged = form.watch("timeZone") !== view.timeZone;
  return (
    <Card size="lg">
      <h2 className="mb-4 mt-0 text-[14px] font-semibold">{t("settings")}</h2>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            try {
              const result = await saveAchievementPreferences(values);
              setMessage(
                result.kind === "restart_required"
                  ? "restartRequired"
                  : result.kind === "disabled"
                    ? "error"
                    : result.kind,
              );
              if (result.kind === "saved") onRefresh();
            } catch {
              setMessage("error");
            }
          }),
        )}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {(["enabled", "showHeader", "emailEnabled"] as const).map((name, i) => (
            <Controller
              control={form.control}
              name={name}
              key={name}
              render={({ field }) => (
                <Switch
                  label={t((["participate", "showHeader", "email"] as const)[i])}
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  disabled={pending || (name === "emailEnabled" && view.emailAvailable === false)}
                  description={
                    name === "emailEnabled" && view.emailAvailable === false
                      ? t("emailUnavailable")
                      : undefined
                  }
                  className="text-[12px] font-medium"
                />
              )}
            />
          ))}
        </div>
        <div className="grid max-w-md gap-2">
          <span className="text-[12px] font-medium">{t("zone")}</span>
          <Controller
            control={form.control}
            name="timeZone"
            render={({ field }) => (
              <MenuSelect
                ariaLabel={t("zone")}
                searchable
                options={zones}
                value={field.value}
                onChange={field.onChange}
                size="input"
                disabled={pending}
              />
            )}
          />
        </div>
        {zoneChanged ? (
          <Controller
            control={form.control}
            name="restartCalendar"
            render={({ field }) => (
              <Switch
                label={t("restart")}
                description={t("restartHelp")}
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                disabled={pending}
              />
            )}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" loading={pending}>
            {t("save")}
          </Button>
          {message ? (
            <p className="m-0 text-[12px] text-fg-muted" role="status">
              {t(message)}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
