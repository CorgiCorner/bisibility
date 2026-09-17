"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import {
  deviceValue,
  hasActionWarning,
  type KeywordDetailActions,
  splitTagInput,
} from "@/components/keywords/action-utils";
import { LocationActionWarning } from "@/components/keywords/LocationActionWarning";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { TargetUrlField } from "@/components/keywords/TargetUrlField";
import { MarketCombobox } from "@/components/markets/MarketCombobox";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { UpdateKeywordInput } from "@/lib/schemas/keyword";
import { serpDeviceOptions } from "@/lib/serp/constants";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { KeywordInlineEditLocationField } from "./KeywordInlineEditLocationField";
import { KeywordInlineEditTextField } from "./KeywordInlineEditTextField";
import {
  countryForLocationFieldValue,
  inlineEditDirty as dirty,
  type InlineEditInput,
  initialInlineEditLocation,
  inlineEditFieldError,
  inlineEditSchema,
  inlineEditTagsError,
} from "./keyword-inline-edit-form";
import { drawerMarketOptions } from "./keyword-inline-edit-markets";

type KeywordInlineEditProps = Pick<KeywordDetailActions, "updateKeywordAction"> & {
  formId?: string;
  focusTargetUrl?: boolean;
  drawerMarkets?: ProjectMarketsView["markets"];
  hideSubmit?: boolean;
  keyword: KeywordRow;
  layout?: "drawer" | "inline";
  lockIdentity?: boolean;
  onSaved: () => void;
  onSavingChange?: (saving: boolean) => void;
  projectId?: string;
};

export function KeywordInlineEdit({
  formId,
  focusTargetUrl = false,
  drawerMarkets = [],
  hideSubmit = false,
  keyword,
  layout = "inline",
  lockIdentity = false,
  onSaved,
  onSavingChange,
  projectId,
  updateKeywordAction,
}: Readonly<KeywordInlineEditProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState(keyword.tags.join(", "));
  const [locationValue, setLocationValue] = useState(() => initialInlineEditLocation(keyword));
  const {
    formState: { dirtyFields, errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<InlineEditInput>({
    defaultValues: {
      city: locationValue.kind === "city" ? (locationValue.cityName ?? null) : null,
      device: deviceValue(keyword.device),
      keyword: keyword.keyword,
      keywordId: keyword.id,
      location: countryForLocationFieldValue(locationValue),
      locationKey: locationValue.kind === "city" ? locationValue.canonicalKey : undefined,
      tags: keyword.tags,
      targetUrl: keyword.targetUrl ?? "",
      topic: keyword.topic ?? "",
      intent: keyword.intent ?? "",
    },
    resolver: zodResolver(inlineEditSchema),
  });
  const tagMessage = inlineEditTagsError(errors, t);
  const device = watch("device");
  const selectedLocationKey = watch("locationKey") ?? keyword.location.canonicalKey;
  const selectedDevice = device ?? deviceValue(keyword.device);
  const deviceOptions = serpDeviceOptions.map((option) => ({
    label: t(option.value === "desktop" ? "deviceDesktop" : "deviceMobile"),
    value: option.value,
  }));
  const drawerMarketError = inlineEditFieldError(
    "location",
    errors.locationKey ?? errors.location ?? errors.city,
    t,
  );
  const drawerMarketList =
    layout === "drawer" ? drawerMarketOptions(drawerMarkets, selectedLocationKey, keyword, t) : [];

  async function save(values: InlineEditInput) {
    setActionError(null);
    setActionWarning(null);
    const { city: _cityValue, location: _location, locationKey, targetUrl, ...rest } = values;
    const payload: UpdateKeywordInput = { ...rest, tags: values.tags ?? [] };
    if (lockIdentity) {
      delete payload.keyword;
      delete payload.device;
    }
    const nextTargetUrl = targetUrl ?? null;
    if (nextTargetUrl !== (keyword.targetUrl ?? null)) {
      payload.targetUrl = nextTargetUrl;
    }
    const locationChanged =
      Boolean(dirtyFields.locationKey) ||
      Boolean(dirtyFields.location) ||
      Boolean(dirtyFields.city);
    if (locationChanged && !lockIdentity) {
      if (!locationKey) {
        setActionError(t("inlineLocationRequired"));
        return;
      }
      payload.locationKey = locationKey;
    }

    onSavingChange?.(true);
    try {
      const result = await updateKeywordAction(payload);
      const hasWarning = hasActionWarning(result);
      router.refresh();
      if (hasWarning) {
        setActionWarning(t("inlineLocationDegraded"));
        return;
      }
      onSaved();
    } catch (error) {
      setActionError(presentSafeActionError(error, sharedErrors, t("inlineSaveFailed")));
    } finally {
      onSavingChange?.(false);
    }
  }

  function handleLocationChange(next: LocationFieldValue) {
    setLocationValue(next);
    setValue("location", countryForLocationFieldValue(next), dirty);
    setValue("city", next.kind === "city" ? (next.cityName ?? null) : null, dirty);
    setValue("locationKey", next.canonicalKey, dirty);
  }

  function handleDrawerMarketChange(canonicalKey: string) {
    setValue("locationKey", canonicalKey, dirty);
  }

  function handleTagsChange(value: string) {
    setTagsText(value);
    setValue("tags", splitTagInput(value), dirty);
  }

  function handleDeviceChange(value: string) {
    setValue("device", value as InlineEditInput["device"], dirty);
  }

  return (
    <form
      className={
        layout === "drawer"
          ? "grid gap-4"
          : "mt-4.5 grid gap-3 border-t border-border pt-4.5 md:grid-cols-[1.2fr_1.4fr_0.8fr]"
      }
      id={formId}
      onSubmit={handleSubmit((values: InlineEditInput) => void save(values))}
    >
      <input type="hidden" {...register("keywordId")} />
      <KeywordInlineEditTextField
        error={inlineEditFieldError("keyword", errors.keyword, t)}
        help={t("inlineKeywordHelp")}
        label={t("inlineKeyword")}
        readOnly={lockIdentity}
        {...register("keyword")}
      />
      <TargetUrlField
        autoFocus={focusTargetUrl}
        error={inlineEditFieldError("targetUrl", errors.targetUrl, t)}
        help={t("inlineTargetUrlHelp")}
        label={t("inlineTargetUrl")}
        {...register("targetUrl")}
      />
      {lockIdentity ? (
        <p className="m-0 text-[12px] text-fg-muted">
          {keyword.location.displayName} / {keyword.location.languageLabel ?? keyword.location.hl} ·{" "}
          {t(deviceValue(keyword.device) === "desktop" ? "deviceDesktop" : "deviceMobile")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 font-sans tabular-nums text-[11px] uppercase tracking-[0.5px] text-fg-muted">
            <FieldLabel help={t("inlineDeviceHelp")} label={t("inlineDevice")} />
            <input type="hidden" {...register("device")} />
            <MenuSelect
              ariaLabel={t("inlineDevice")}
              onChange={handleDeviceChange}
              options={deviceOptions}
              triggerClassName="min-h-10 w-full justify-between rounded-control border-border-control bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal"
              value={selectedDevice}
            />
          </div>
          <div
            className={cn(
              "flex flex-col gap-1.5 font-sans tabular-nums text-[11px] uppercase tracking-[0.5px] text-fg-muted",
              layout === "inline" && "md:col-span-3",
            )}
          >
            {layout === "drawer" ? (
              <>
                <span>{t("inlineMarket")}</span>
                <MarketCombobox
                  ariaLabel={t("inlineMarket")}
                  catalogMarkets={[]}
                  onChange={handleDrawerMarketChange}
                  trackedMarkets={drawerMarketList}
                  triggerClassName="min-h-10 w-full rounded-control px-3 text-[13px] normal-case tracking-normal"
                  value={selectedLocationKey}
                />
                {drawerMarketError ? (
                  <span className="normal-case tracking-normal text-red-text">
                    {drawerMarketError}
                  </span>
                ) : null}
              </>
            ) : (
              <KeywordInlineEditLocationField
                error={
                  errors.locationKey?.message ?? errors.location?.message ?? errors.city?.message
                }
                keywordId={keyword.id}
                onChange={handleLocationChange}
                projectId={projectId ?? null}
                value={locationValue}
              />
            )}
          </div>
        </>
      )}
      <KeywordInlineEditTextField
        error={inlineEditFieldError("topic", errors.topic, t)}
        help={t("inlineTopicHelp")}
        label={t("inlineTopic")}
        wide={layout === "inline"}
        {...register("topic")}
      />
      <KeywordInlineEditTextField
        error={inlineEditFieldError("intent", errors.intent, t)}
        help={t("inlineIntentHelp")}
        label={t("inlineIntent")}
        wide={layout === "inline"}
        {...register("intent")}
      />
      <KeywordInlineEditTextField
        error={tagMessage}
        help={t("inlineTagsHelp")}
        label={t("inlineTags")}
        onChange={(event) => handleTagsChange(event.target.value)}
        value={tagsText}
        wide={layout === "inline"}
      />
      {!hideSubmit || actionError || actionWarning ? (
        <div
          className={cn("flex flex-col justify-end gap-2", layout === "inline" && "md:col-span-3")}
        >
          {!hideSubmit ? (
            <Button
              disabled={isSubmitting}
              style={{ minHeight: 40 }}
              type="submit"
              variant="primary"
            >
              {isSubmitting ? t("inlineSaving") : t("inlineSave")}
            </Button>
          ) : null}
          {actionError ? (
            <span className="font-sans tabular-nums text-[11px] text-red-text">{actionError}</span>
          ) : null}
          <LocationActionWarning message={actionWarning} />
        </div>
      ) : null}
    </form>
  );
}
