"use client";

import { useAccountActionError } from "@/components/account/useAccountActionError";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { type ActiveLocale, activeLocaleValues, localeAutonyms } from "@/i18n/config";
import {
  dateFormatExamples,
  preferencesSchema,
  type UserPreferences,
} from "@/lib/account/preferences-shared";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { primaryNavEntries } from "@/lib/nav/nav-items";
import { applyTheme } from "@/lib/theme/browser-theme";
import { cn } from "@/lib/ui/cn";
import { ListIcon as List } from "@phosphor-icons/react/dist/csr/List";
import { ListDashesIcon as ListDashes } from "@phosphor-icons/react/dist/csr/ListDashes";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { MoonStarsIcon as MoonStars } from "@phosphor-icons/react/dist/csr/MoonStars";
import { RowsIcon as Rows } from "@phosphor-icons/react/dist/csr/Rows";
import { SunIcon as Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { type UseFormSetValue, useForm } from "react-hook-form";
import { AccountSection } from "./AccountSection";
import { feedbackClass, fieldLabelClass } from "./account-ui";

export type PreferencesFormProps = {
  autoExample: "day_first" | "month_first" | "iso";
  defaults: UserPreferences;
  locale: ActiveLocale;
  todayKey: string;
  updatePreferences: (input: UserPreferences) => Promise<UserPreferences>;
  updateUiLocale: (input: ActiveLocale) => Promise<ActiveLocale>;
};

const selectTriggerClass =
  "min-h-10 w-full justify-between rounded-control border-border-control bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";

function themeIcon(value: UserPreferences["theme"]) {
  if (value === "light") {
    return <Sun aria-hidden size={15} weight="regular" />;
  }
  return value === "dark" ? (
    <MoonStars aria-hidden size={15} weight="regular" />
  ) : (
    <Monitor aria-hidden size={15} weight="regular" />
  );
}

function densityIcon(value: UserPreferences["density"]) {
  if (value === "compact") {
    return <ListDashes aria-hidden size={16} weight="regular" />;
  }
  if (value === "comfortable") {
    return <Rows aria-hidden size={16} weight="regular" />;
  }
  return <List aria-hidden size={16} weight="regular" />;
}

function themeSegments(
  labels: Record<UserPreferences["theme"], string>,
): SegmentedControlOption<UserPreferences["theme"]>[] {
  return (["light", "dark", "system"] as const).map((value) => ({
    label: (
      <>
        {themeIcon(value)}
        <span>{labels[value]}</span>
      </>
    ),
    value,
  }));
}

function densitySegments(
  labels: Record<UserPreferences["density"], string>,
): SegmentedControlOption<UserPreferences["density"]>[] {
  return (["compact", "standard", "comfortable"] as const).map((value) => ({
    label: (
      <>
        {densityIcon(value)}
        <span className="sr-only">{labels[value]}</span>
      </>
    ),
    value,
  }));
}

function setPreferenceValue(
  setValue: UseFormSetValue<UserPreferences>,
  key: keyof UserPreferences,
  value: UserPreferences[keyof UserPreferences],
) {
  const options = { shouldDirty: true, shouldValidate: true };

  if (key === "dateFormat") {
    setValue("dateFormat", value as UserPreferences["dateFormat"], options);
  }
  if (key === "density") {
    setValue("density", value as UserPreferences["density"], options);
  }
  if (key === "landing") {
    setValue("landing", value as UserPreferences["landing"], options);
  }
  if (key === "theme") {
    setValue("theme", value as UserPreferences["theme"], options);
  }
}

export function PreferencesForm({
  autoExample,
  defaults,
  locale,
  todayKey,
  updatePreferences,
  updateUiLocale,
}: Readonly<PreferencesFormProps>) {
  const router = useRouter();
  const t = useTranslations("account.preferences");
  const actionError = useAccountActionError();
  const [message, setMessage] = useState<string | null>(null);
  const localeRequestPending = useRef(false);
  const [isPending, startTransition] = useTransition();
  const { getValues, register, reset, setValue, watch } = useForm<UserPreferences>({
    defaultValues: defaults,
    mode: "onChange",
    resolver: zodResolver(preferencesSchema),
  });
  const theme = watch("theme");
  const dateFormat = watch("dateFormat");
  const landing = watch("landing");
  const density = watch("density");
  const dateExamples = dateFormatExamples(todayKey, autoExample, locale);
  const formatOptions = [
    { label: t("date.auto", { date: dateExamples.auto }), value: "auto" },
    { label: dateExamples.day_first, value: "day_first" },
    { label: dateExamples.month_first, value: "month_first" },
    { label: dateExamples.iso, value: "iso" },
  ] as const;
  const landingLabels = {
    backlinks: t("landing.backlinks"),
    competitors: t("landing.competitors"),
    dashboard: t("landing.dashboard"),
    "domain-overview": t("landing.domain-overview"),
    "keyword-research": t("landing.keyword-research"),
    "rank-tracker": t("landing.rank-tracker"),
    "search-console": t("landing.search-console"),
    timeline: t("landing.timeline"),
  } satisfies Record<UserPreferences["landing"], string>;
  const landingOptions = primaryNavEntries.map((entry) => ({
    label: landingLabels[entry.segment],
    value: entry.segment,
  }));
  const themeLabels = {
    dark: t("theme.dark"),
    light: t("theme.light"),
    system: t("theme.system"),
  } satisfies Record<UserPreferences["theme"], string>;
  const densityLabels = {
    comfortable: t("density.comfortable"),
    compact: t("density.compact"),
    standard: t("density.standard"),
  } satisfies Record<UserPreferences["density"], string>;

  function persist<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferenceValue(setValue, key, value);
    const next = preferencesSchema.parse({ ...getValues(), [key]: value });
    setMessage(null);
    applyTheme(next.theme);
    startTransition(async () => {
      try {
        const saved = await updatePreferences(next);
        reset(saved);
        router.refresh();
      } catch (error: unknown) {
        setMessage(actionError.generic(error, t("saveError")));
      }
    });
  }

  function persistLocale(value: string) {
    if (localeRequestPending.current) return;

    localeRequestPending.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        await updateUiLocale(value as ActiveLocale);
        router.refresh();
      } catch (error: unknown) {
        setMessage(actionError.generic(error, t("saveError")));
      } finally {
        localeRequestPending.current = false;
      }
    });
  }

  return (
    <form aria-busy={isPending} id="account-preferences-form">
      <AccountSection
        contentClassName="px-5 py-4.5"
        description={t.rich("description", { emphasis: (chunks) => <strong>{chunks}</strong> })}
        title={t("title")}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3.5">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-fg">{t("theme.label")}</div>
              <div className="mt-px text-xs text-fg-muted">{t("theme.subtitle")}</div>
            </div>
            <SegmentedControl
              ariaLabel={t("theme.ariaLabel")}
              fitContent
              name="theme"
              onChange={(value) => persist("theme", value)}
              options={themeSegments(themeLabels)}
              size="xs"
              value={theme}
            />
          </div>
          <div className="grid gap-3.5 border-t border-border pt-4 sm:grid-cols-2">
            <div className={fieldLabelClass}>
              <span>{t("date.label")}</span>
              <input type="hidden" {...register("dateFormat")} />
              <MenuSelect
                ariaLabel={t("date.ariaLabel")}
                onChange={(value) => persist("dateFormat", value as UserPreferences["dateFormat"])}
                options={formatOptions}
                triggerClassName={selectTriggerClass}
                value={dateFormat}
              />
            </div>
            <div className={fieldLabelClass}>
              <span>{t("landing.label")}</span>
              <input type="hidden" {...register("landing")} />
              <MenuSelect
                ariaLabel={t("landing.ariaLabel")}
                onChange={(value) => persist("landing", value as UserPreferences["landing"])}
                options={landingOptions}
                triggerClassName={selectTriggerClass}
                value={landing}
              />
            </div>
          </div>
          <div className="grid gap-3.5 border-t border-border pt-4 sm:grid-cols-2">
            <div className={fieldLabelClass}>
              <span>{t("language.label")}</span>
              <span className="text-xs font-normal normal-case tracking-normal text-fg-muted">
                {t("language.description")}
              </span>
              <MenuSelect
                ariaLabel={t("language.label")}
                disabled={isPending}
                onChange={persistLocale}
                options={activeLocaleValues.map((value) => ({
                  label: localeAutonyms[value],
                  value,
                }))}
                triggerClassName={selectTriggerClass}
                value={locale}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border pt-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-fg">{t("density.label")}</div>
              <div className="mt-px text-xs text-fg-muted">{t("density.subtitle")}</div>
            </div>
            <SegmentedControl
              ariaLabel={t("density.ariaLabel")}
              fitContent
              name="density"
              onChange={(value) => persist("density", value)}
              options={densitySegments(densityLabels)}
              size="xs"
              value={density}
            />
          </div>
        </div>
        {message ? (
          <span className={cn(feedbackClass, "mt-3 block text-red-text")}>{message}</span>
        ) : null}
      </AccountSection>
    </form>
  );
}
