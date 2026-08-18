"use client";

import { MenuSelect, SegmentedControl, type SegmentedControlOption } from "@/components/ui";
import {
  dateFormatOptions,
  densityOptions,
  landingOptions,
  preferencesSchema,
  themeOptions,
  type UserPreferences,
} from "@/lib/account/preferences-shared";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { applyTheme } from "@/lib/theme/browser-theme";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import {
  ListIcon as List,
  ListDashesIcon as ListDashes,
  MonitorIcon as Monitor,
  MoonStarsIcon as MoonStars,
  RowsIcon as Rows,
  SunIcon as Sun,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type UseFormSetValue, useForm } from "react-hook-form";
import { AccountSection } from "./AccountSection";
import { feedbackClass, fieldLabelClass } from "./account-ui";

export type PreferencesFormProps = {
  defaults: UserPreferences;
  updatePreferences: (input: UserPreferences) => Promise<UserPreferences>;
};

const selectTriggerClass =
  "min-h-10 w-full justify-between rounded-lg border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";

function themeIcon(value: UserPreferences["theme"]) {
  if (value === "light") {
    return <Sun aria-hidden size={15} />;
  }
  return value === "dark" ? <MoonStars aria-hidden size={15} /> : <Monitor aria-hidden size={15} />;
}

function densityIcon(value: UserPreferences["density"]) {
  if (value === "compact") {
    return <ListDashes aria-hidden size={16} />;
  }
  if (value === "comfortable") {
    return <Rows aria-hidden size={16} />;
  }
  return <List aria-hidden size={16} />;
}

function themeSegments(): SegmentedControlOption<UserPreferences["theme"]>[] {
  return themeOptions.map((option) => ({
    label: (
      <>
        {themeIcon(option.value)}
        <span>{option.label}</span>
      </>
    ),
    value: option.value,
  }));
}

function densitySegments(): SegmentedControlOption<UserPreferences["density"]>[] {
  return densityOptions.map((option) => ({
    label: (
      <>
        {densityIcon(option.value)}
        <span className="sr-only">{option.label}</span>
      </>
    ),
    value: option.value,
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

export function PreferencesForm({ defaults, updatePreferences }: Readonly<PreferencesFormProps>) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
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

  function persist<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferenceValue(setValue, key, value);
    const next = preferencesSchema.parse({ ...getValues(), [key]: value });
    setMessage(null);
    applyTheme(next.theme);
    startTransition(() => {
      void updatePreferences(next)
        .then((saved) => {
          reset(saved);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Preferences could not be saved.")),
        );
    });
  }

  return (
    <form aria-busy={isPending} id="account-preferences-form">
      <AccountSection
        contentClassName="px-5 py-4.5"
        description="Personal to you, applied on every device you sign in from."
        title="Preferences"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3.5">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-fg">Theme</div>
              <div className="mt-px text-xs text-fg-muted">Light, dark, or follow your system</div>
            </div>
            <SegmentedControl
              ariaLabel="Theme"
              name="theme"
              onChange={(value) => persist("theme", value)}
              optionClassName="min-h-8 flex-row gap-1.5 px-3 py-1.5"
              options={themeSegments()}
              value={theme}
            />
          </div>
          <div className="grid gap-3.5 border-t border-border-soft pt-4 sm:grid-cols-2">
            <div className={fieldLabelClass}>
              <span>Date format</span>
              <input type="hidden" {...register("dateFormat")} />
              <MenuSelect
                ariaLabel="Date format"
                onChange={(value) => persist("dateFormat", value as UserPreferences["dateFormat"])}
                options={dateFormatOptions}
                triggerClassName={selectTriggerClass}
                value={dateFormat}
              />
            </div>
            <div className={fieldLabelClass}>
              <span>Default landing page</span>
              <input type="hidden" {...register("landing")} />
              <MenuSelect
                ariaLabel="Default landing page"
                onChange={(value) => persist("landing", value as UserPreferences["landing"])}
                options={landingOptions}
                triggerClassName={selectTriggerClass}
                value={landing}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border-soft pt-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-fg">Default table density</div>
              <div className="mt-px text-xs text-fg-muted">Row height in the keyword grid</div>
            </div>
            <SegmentedControl
              ariaLabel="Default table density"
              name="density"
              onChange={(value) => persist("density", value)}
              optionClassName="min-h-8 px-3 py-1.5"
              options={densitySegments()}
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
