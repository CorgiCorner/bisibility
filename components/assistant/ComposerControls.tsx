"use client";

import { MenuItem } from "@/components/ui/MenuItem";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { menuSelectRowStyle } from "@/components/ui/MenuSelectOptionItem";
import { modelsByProvider, providerFunding } from "@/lib/assistant/client/composer-choice";
import { PROVIDER_LABELS } from "@/lib/assistant/client/provider-label";
import type { AssistantEffort } from "@/lib/assistant/effort";
import type { AssistantConfigView, ModelView } from "@/lib/assistant/wire";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

/**
 * In-field select: the standard input size (40px, 44px below `sm`) like the send button beside
 * it, without its own border because the composer field draws the only frame.
 */
const inFieldSelectClassName =
  "border-transparent bg-transparent hover:bg-bg-sunken focus:border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid data-[state=open]:bg-bg-sunken";

type ModelSelectProps = {
  config: AssistantConfigView;
  disabled: boolean;
  models: readonly ModelView[];
  onChange: (modelId: string) => void;
  project: string;
  value: string;
};

/** Models grouped by provider; each heading names who pays for that provider's models. */
export function ModelSelect({
  config,
  disabled,
  models,
  onChange,
  project,
  value,
}: Readonly<ModelSelectProps>) {
  const t = useTranslations("assistant");
  const groups = modelsByProvider(models).map(({ provider, models: items }) => {
    const funding = providerFunding(config, provider).choice.mode;
    return {
      id: provider,
      label: `${PROVIDER_LABELS[provider]} · ${funding === "credits" ? t("credits") : t("fundingKey")}`,
      options: items.map((item) => ({
        value: item.id,
        label: item.label,
        secondary: item.efforts.length ? t("modelEffort") : t("modelNoEffort"),
      })),
    };
  });
  return (
    <MenuSelect
      ariaLabel={t("model")}
      disabled={disabled}
      groups={groups}
      menuFooter={
        <MenuItem
          className="w-full"
          component={Link}
          href={`${appPath(project, "providers")}#assistant-funding`}
          style={menuSelectRowStyle}
        >
          {t("chooseFunding")}
        </MenuItem>
      }
      menuMinWidth={280}
      onChange={onChange}
      size="input"
      triggerClassName={cn(inFieldSelectClassName, "min-w-0 flex-1")}
      value={value}
    />
  );
}

type EffortSelectProps = {
  defaultEffort: AssistantEffort | null;
  disabled: boolean;
  efforts: readonly AssistantEffort[];
  onChange: (effort: AssistantEffort) => void;
  value: AssistantEffort | null;
};

/** Only the chosen model's efforts. A model without reasoning levels shows no effort control. */
export function EffortSelect({
  defaultEffort,
  disabled,
  efforts,
  onChange,
  value,
}: Readonly<EffortSelectProps>) {
  const t = useTranslations("assistant");
  if (!efforts.length || !value) return null;
  return (
    <MenuSelect
      ariaLabel={t("effort")}
      disabled={disabled}
      menuFooter={<p className="m-0 px-2 py-1.5 text-xs text-fg-muted">{t("effortHint")}</p>}
      menuMinWidth={220}
      onChange={(next) => {
        const effort = efforts.find((item) => item === next);
        if (effort) onChange(effort);
      }}
      options={efforts.map((item) => ({
        value: item,
        label: t(`efforts.${item}`),
        secondary: item === defaultEffort ? t("effortDefault") : t(`effortHints.${item}`),
      }))}
      pinCaret={false}
      size="input"
      triggerClassName={cn(inFieldSelectClassName, "w-auto shrink-0")}
      value={value}
    />
  );
}

type OutputLimitSelectProps = {
  disabled: boolean;
  limits: readonly number[];
  onChange: (maxOutputTokens: number | null) => void;
  /** Null is the model's own maximum, the last of the limits. */
  value: number | null;
};

/**
 * Per-turn token limit, right of the effort menu. The trigger shows only the short value
 * (1k, 4k, 16k or Max) so the composer row stays compact; the menu explains what it bounds.
 */
export function OutputLimitSelect({
  disabled,
  limits,
  onChange,
  value,
}: Readonly<OutputLimitSelectProps>) {
  const t = useTranslations("assistant");
  const format = useFormatter();
  const modelMax = limits.at(-1);
  if (!modelMax) return null;
  const selected = value ?? modelMax;
  return (
    <MenuSelect
      ariaLabel={t("tokenLimit")}
      disabled={disabled}
      menuFooter={<p className="m-0 px-2 py-1.5 text-xs text-fg-muted">{t("tokenLimitHint")}</p>}
      menuMinWidth={240}
      onChange={(next) => {
        const limit = limits.find((item) => String(item) === next);
        if (limit) onChange(limit === modelMax ? null : limit);
      }}
      options={limits.map((limit) => ({
        value: String(limit),
        label: limit === modelMax ? t("tokenLimitMax") : `${Math.round(limit / 1024)}k`,
        secondary: t("tokenLimitTokens", { count: format.number(limit) }),
      }))}
      pinCaret={false}
      size="input"
      triggerClassName={cn(inFieldSelectClassName, "w-auto shrink-0")}
      value={String(selected)}
    />
  );
}
