"use client";
import {
  MarketDefinition,
  type MarketDefinitionValue,
  marketDefinitionMessages,
} from "@/components/markets/blocks/MarketDefinition";
import {
  emptyMarketDefinition,
  marketDefinitionSelection,
} from "@/components/markets/blocks/market-definition-selection";
import { catalogMarketDefinitionSource } from "@/components/markets/blocks/market-definition-source";
import {
  ScheduleReviewCancelled,
  useScheduleSpendReview,
} from "@/components/schedules/useScheduleSpendReview";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { type NewMarketCreateInput, newMarketCreateSchema } from "@/lib/markets/create-input";
import { marketCreateChange } from "@/lib/markets/create-review-change";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { NewMarketCreationFields } from "./NewMarketCreationFields";
import { NewMarketExisting } from "./NewMarketExisting";
import type { NewMarketScheduleOption } from "./NewMarketSchedule";
import { NewMarketScheduleEditor } from "./NewMarketScheduleEditor";
import { NewMarketSheetFooter } from "./NewMarketSheetFooter";
import {
  marketActionError,
  type NewMarketCreatorMessages,
  pasteErrorMessage,
} from "./new-market-creator-copy";
import { defaults, expectedKeywordCount, pasteState } from "./new-market-creator-model";

export type { NewMarketCreatorMessages } from "./new-market-creator-copy";
export type { NewMarketCreatorFrame, NewMarketCreatorProps } from "./new-market-creator-types";

import type { NewMarketCreatorProps } from "./new-market-creator-types";

export function NewMarketCreator({
  children,
  definitionOnly,
  deviceTracking,
  messages,
  onClose,
  onCreate,
  onCreated,
  onScheduleCreated,
  projectId,
  registry = [],
  schedules,
  scheduleContext,
  source,
  sources,
}: Readonly<NewMarketCreatorProps>) {
  const review = useScheduleSpendReview(projectId);
  const t = useTranslations("projectMarkets");
  const resolvedMessages =
    messages ??
    ({
      actionError: (error: unknown) => marketActionError(error, t),
      backToMarket: t("backToMarket"),
      cancel: t("cancel"),
      createMarket: t("create"),
      description: t("newMarketDescription"),
      marketDefinition: marketDefinitionMessages(t),
      newMarket: t("newMarket"),
      newSchedule: t("newSchedule"),
    } satisfies NewMarketCreatorMessages);
  const [devicePending, setDevicePending] = useState(false);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [createdSchedules, setCreatedSchedules] = useState<NewMarketScheduleOption[]>([]);
  const context = scheduleContext ?? {
    connectedProviders: [],
    projectDefaults: { provider: null, serpDepth: DEFAULT_SERP_DEPTH },
    projectTimezone: "UTC",
  };
  const availableSchedules = [
    ...schedules,
    ...createdSchedules.filter((created) => !schedules.some((item) => item.id === created.id)),
  ];
  const [actionError, setActionError] = useState<string | null>(null);
  const [definition, setDefinition] = useState<MarketDefinitionValue>(emptyMarketDefinition);
  const defaultValues = {
    ...defaults(projectId),
    ...(definitionOnly
      ? { devices: [...definitionOnly.devices], method: { kind: "empty" as const } }
      : {}),
  };
  const form = useZodForm<NewMarketCreateInput>(newMarketCreateSchema, {
    defaultValues: defaultValues as never,
  });
  const canonicalKey = form.watch("canonicalKey");
  const formDevices = form.watch("devices");
  const devices = definitionOnly?.devices ?? formDevices;
  const method = form.watch("method");
  const schedule = form.watch("schedule");
  const locationSource = useMemo(
    () => source ?? catalogMarketDefinitionSource(projectId),
    [projectId, source],
  );
  const paste = useMemo(() => pasteState(method), [method]);
  const pasteError = pasteErrorMessage(paste.error, t);
  const prospectiveCount = expectedKeywordCount(method, sources, paste.count, devices);
  const baseValid = Boolean(canonicalKey && devices?.length);
  const methodValid =
    method?.kind === "empty" ||
    (method?.kind === "copy" && Boolean(method.sourceMarketId) && Boolean(schedule)) ||
    (method?.kind === "paste" && pasteError === null && paste.count > 0 && Boolean(schedule));
  const duplicate = registry.find((entry) => entry.canonicalKey === canonicalKey);
  const createDisabled =
    form.formState.isSubmitting || !baseValid || !methodValid || Boolean(duplicate);

  /** The block owns the place; the form only ever holds the selection it resolves to. */
  function updateDefinition(next: MarketDefinitionValue) {
    setDefinition(next);
    const selection = marketDefinitionSelection(next);
    const options = { shouldDirty: true, shouldValidate: true };
    form.setValue("canonicalKey", selection?.canonicalKey ?? "", options);
    form.setValue("countryCode", selection?.countryCode ?? next.countryCode ?? "", options);
    form.setValue("kind", selection?.kind ?? "country", options);
    form.setValue("languageCode", selection?.languageCode ?? next.languageCode ?? "", options);
    form.setValue("name", next.customName, options);
  }

  function updateDevices(next: string) {
    form.setValue(
      "devices",
      next === "both" ? ["desktop", "mobile"] : [next as "desktop" | "mobile"],
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function updateMethod(next: NewMarketCreateInput["method"]) {
    form.setValue("method", next, { shouldDirty: true, shouldValidate: true });
    form.setValue(
      "schedule",
      next.kind === "empty" ? null : (form.getValues("schedule") ?? { kind: "manual" }),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function close() {
    if (devicePending || review.isActive()) return;
    form.reset(defaultValues as never);
    setDefinition(emptyMarketDefinition);
    setActionError(null);
    setCreatingSchedule(false);
    onClose();
  }

  async function submit(input: NewMarketCreateInput) {
    if (createDisabled) return;
    setActionError(null);
    try {
      const data = definitionOnly ? { ...input, devices: [...definitionOnly.devices] } : input;
      const created = await review.run(marketCreateChange(data), (submission) =>
        onCreate({ ...data, review: submission }),
      );
      onCreated?.(created);
      close();
    } catch (cause) {
      if (cause instanceof ScheduleReviewCancelled) return;
      setActionError(resolvedMessages.actionError(cause));
    }
  }

  return (
    <>
      {review.dialog}
      {children({
        backLabel: resolvedMessages.backToMarket,
        creatingSchedule,
        onBack: () => (creatingSchedule ? setCreatingSchedule(false) : close()),
        onClose: close,
        title: creatingSchedule ? resolvedMessages.newSchedule : resolvedMessages.newMarket,
        footer: creatingSchedule ? undefined : (
          <NewMarketSheetFooter
            createDisabled={createDisabled}
            onClose={close}
            pending={form.formState.isSubmitting || devicePending}
            prospectiveCount={definitionOnly || duplicate ? undefined : prospectiveCount}
            showCreate={!duplicate || Boolean(definitionOnly)}
            cancelLabel={resolvedMessages.cancel}
            createLabel={resolvedMessages.createMarket}
          />
        ),
        content: creatingSchedule ? (
          <NewMarketScheduleEditor
            context={context}
            onBack={() => setCreatingSchedule(false)}
            onSaved={(saved) => {
              setCreatedSchedules((current) => [
                ...current,
                { id: saved.publicId, name: saved.name, frequency: saved.frequency },
              ]);
              onScheduleCreated?.({
                id: saved.publicId,
                name: saved.name,
                frequency: saved.frequency,
              });
              form.setValue(
                "schedule",
                { kind: "existing", scheduleId: saved.publicId },
                { shouldDirty: true, shouldValidate: true },
              );
              setCreatingSchedule(false);
            }}
            projectId={projectId}
          />
        ) : (
          <form
            className="grid gap-5"
            id="new-market-form"
            onSubmit={(event) => {
              event.stopPropagation();
              if (definitionOnly) form.setValue("devices", [...definitionOnly.devices]);
              void form.handleSubmit(submit)(event);
            }}
          >
            <p className="m-0 text-[13px] text-fg-muted">{resolvedMessages.description}</p>
            <fieldset className="contents" disabled={form.formState.isSubmitting || devicePending}>
              <MarketDefinition
                duplicate={null}
                messages={resolvedMessages.marketDefinition}
                onChange={updateDefinition}
                registry={registry}
                source={locationSource}
                value={definition}
              />
              {/* Onboarding drafts have no saved market to open; the definition explains the duplicate. */}
              {duplicate && !definitionOnly ? (
                <NewMarketExisting
                  market={duplicate}
                  projectId={projectId}
                  schedules={availableSchedules}
                  tracking={!definitionOnly ? deviceTracking : undefined}
                  onAdded={() => {
                    deviceTracking?.onAdded?.();
                    onClose();
                  }}
                  onPendingChange={setDevicePending}
                />
              ) : !definitionOnly ? (
                <NewMarketCreationFields
                  devices={devices}
                  method={method}
                  pasteError={pasteError}
                  schedule={schedule}
                  schedules={availableSchedules}
                  sources={sources}
                  onDevices={updateDevices}
                  onMethod={updateMethod}
                  onSchedule={(next) =>
                    form.setValue("schedule", next, { shouldDirty: true, shouldValidate: true })
                  }
                  onNewSchedule={() => setCreatingSchedule(true)}
                />
              ) : null}
            </fieldset>
            {actionError || form.formState.errors.name ? (
              <p className="m-0 text-[12px] text-red-text" role="alert">
                {actionError ?? t("marketNameTooLong")}
              </p>
            ) : null}
          </form>
        ),
      })}
    </>
  );
}
