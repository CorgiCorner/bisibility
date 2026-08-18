"use client";

import {
  actionErrorMessage,
  actionWarningMessage,
  deviceValue,
  type KeywordDetailActions,
  splitTagInput,
} from "@/components/keywords/action-utils";
import { LocationActionWarning } from "@/components/keywords/LocationActionWarning";
import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import {
  countryForLocationFieldValue,
  locationFieldValueFromKeywordLocation,
} from "@/components/keywords/location-field-value";
import { TargetUrlField } from "@/components/keywords/TargetUrlField";
import { MarketCombobox } from "@/components/markets/MarketCombobox";
import { Button, FieldLabel, MenuSelect } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { type UpdateKeywordInput, updateKeywordSchema } from "@/lib/schemas/keyword";
import { normalizeSerpMarketName, serpDeviceOptions } from "@/lib/serp/markets";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldErrors, useForm } from "react-hook-form";
import { z } from "zod";
import { KeywordInlineEditTextField } from "./KeywordInlineEditTextField";
import { drawerMarketOptions } from "./keyword-inline-edit-markets";

type KeywordInlineEditProps = Pick<KeywordDetailActions, "updateKeywordAction"> & {
  formId?: string;
  focusTargetUrl?: boolean;
  drawerMarkets?: ProjectMarketsView["markets"];
  hideSubmit?: boolean;
  keyword: KeywordRow;
  layout?: "drawer" | "inline";
  onSaved: () => void;
  onSavingChange?: (saving: boolean) => void;
  projectId?: string;
};

const inlineEditSchema = updateKeywordSchema.extend({
  city: z.string().nullable().optional(),
  location: z.string().optional(),
});
type InlineEditInput = z.infer<typeof inlineEditSchema>;

const dirty = { shouldDirty: true, shouldValidate: true } as const;

function tagsError(errors: FieldErrors<InlineEditInput>) {
  const error = errors.tags;
  if (Array.isArray(error)) {
    return error[0]?.message;
  }
  return error?.message;
}

function initialLocationValue(keyword: KeywordRow): LocationFieldValue {
  return locationFieldValueFromKeywordLocation(keyword.location, keyword.locationName);
}

export function KeywordInlineEdit({
  formId,
  focusTargetUrl = false,
  drawerMarkets = [],
  hideSubmit = false,
  keyword,
  layout = "inline",
  onSaved,
  onSavingChange,
  projectId,
  updateKeywordAction,
}: Readonly<KeywordInlineEditProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState(keyword.tags.join(", "));
  const [locationValue, setLocationValue] = useState(() => initialLocationValue(keyword));
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
  const tagMessage = tagsError(errors);
  const device = watch("device");
  const selectedLocationKey = watch("locationKey") ?? keyword.location.canonicalKey;
  const selectedDevice = device ?? deviceValue(keyword.device);
  const deviceOptions = serpDeviceOptions.map((option) => ({
    label: option.label,
    value: option.value,
  }));
  const drawerMarketError =
    errors.locationKey?.message ?? errors.location?.message ?? errors.city?.message;
  const drawerMarketList =
    layout === "drawer" ? drawerMarketOptions(drawerMarkets, selectedLocationKey, keyword) : [];

  async function save(values: InlineEditInput) {
    setActionError(null);
    setActionWarning(null);
    const { city: cityValue, location, locationKey, targetUrl, ...rest } = values;
    const payload: UpdateKeywordInput = { ...rest, tags: values.tags ?? [] };
    const nextTargetUrl = targetUrl ?? null;
    if (nextTargetUrl !== (keyword.targetUrl ?? null)) {
      payload.targetUrl = nextTargetUrl;
    }
    const locationChanged =
      Boolean(dirtyFields.locationKey) ||
      Boolean(dirtyFields.location) ||
      Boolean(dirtyFields.city);
    if (locationChanged) {
      if (locationKey) {
        payload.locationKey = locationKey;
      } else {
        const nextCountry = normalizeSerpMarketName(location);
        if (!nextCountry) {
          setActionError("Choose a supported SERP country.");
          return;
        }
        payload.location = nextCountry;
        payload.city = cityValue?.trim() ? cityValue.trim() : null;
      }
    }

    onSavingChange?.(true);
    try {
      const result = await updateKeywordAction(payload);
      const warning = actionWarningMessage(result);
      router.refresh();
      if (warning) {
        setActionWarning(warning);
        return;
      }
      onSaved();
    } catch (error) {
      setActionError(actionErrorMessage(error));
    } finally {
      onSavingChange?.(false);
    }
  }

  function handleLocationChange(next: LocationFieldValue) {
    setLocationValue(next);
    setValue("location", countryForLocationFieldValue(next), dirty);
    setValue("city", next.kind === "city" ? (next.cityName ?? null) : null, dirty);
    setValue("locationKey", next.kind === "city" ? next.canonicalKey : undefined, dirty);
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
        error={errors.keyword?.message}
        help={FIELD_HELP.keyword}
        label="Keyword"
        {...register("keyword")}
      />
      <TargetUrlField
        autoFocus={focusTargetUrl}
        error={errors.targetUrl?.message}
        {...register("targetUrl")}
      />
      <div className="flex flex-col gap-1.5 font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted">
        <FieldLabel help={FIELD_HELP.device} label="Device" />
        <input type="hidden" {...register("device")} />
        <MenuSelect
          ariaLabel="Device"
          onChange={handleDeviceChange}
          options={deviceOptions}
          triggerClassName="min-h-10 w-full justify-between rounded-lg border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal"
          value={selectedDevice}
        />
      </div>
      <div
        className={cn(
          "flex flex-col gap-1.5 font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted",
          layout === "inline" && "md:col-span-3",
        )}
      >
        {layout === "drawer" ? (
          <>
            <span>Market</span>
            <MarketCombobox
              ariaLabel="Market"
              catalogMarkets={[]}
              onChange={handleDrawerMarketChange}
              trackedMarkets={drawerMarketList}
              triggerClassName="min-h-10 w-full rounded-lg px-3 text-[13px] normal-case tracking-normal"
              value={selectedLocationKey}
            />
            {drawerMarketError ? (
              <span className="normal-case tracking-normal text-red-text">{drawerMarketError}</span>
            ) : null}
          </>
        ) : (
          <LocationField
            error={errors.locationKey?.message ?? errors.location?.message ?? errors.city?.message}
            idPrefix={`inline-${keyword.id}`}
            help={FIELD_HELP.location}
            onChange={handleLocationChange}
            projectId={projectId ?? null}
            value={locationValue}
          />
        )}
      </div>
      <KeywordInlineEditTextField
        error={errors.topic?.message}
        help={FIELD_HELP.topic}
        label="Topic"
        wide={layout === "inline"}
        {...register("topic")}
      />
      <KeywordInlineEditTextField
        error={errors.intent?.message}
        help={FIELD_HELP.intent}
        label="Intent"
        wide={layout === "inline"}
        {...register("intent")}
      />
      <KeywordInlineEditTextField
        error={tagMessage}
        help={FIELD_HELP.tags}
        label="Tags"
        onChange={(event) => handleTagsChange(event.target.value)}
        value={tagsText}
        wide={layout === "inline"}
      />
      {!hideSubmit || actionError || actionWarning ? (
        <div
          className={cn("flex flex-col justify-end gap-2", layout === "inline" && "md:col-span-3")}
        >
          {!hideSubmit ? (
            <Button disabled={isSubmitting} sx={{ minHeight: 40 }} type="submit" variant="primary">
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          ) : null}
          {actionError ? (
            <span className="font-mono text-[11px] text-red-text">{actionError}</span>
          ) : null}
          <LocationActionWarning message={actionWarning} />
        </div>
      ) : null}
    </form>
  );
}
