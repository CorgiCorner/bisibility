"use client";

import {
  MarketDefinition,
  type MarketDefinitionLocationSource,
  type MarketDefinitionRegistryEntry,
  type MarketDefinitionValue,
} from "@/components/markets/blocks/MarketDefinition";
import {
  emptyMarketDefinition,
  marketDefinitionSelection,
} from "@/components/markets/blocks/market-definition-selection";
import { catalogMarketDefinitionSource } from "@/components/markets/blocks/market-definition-source";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type NewMarketCreateInput,
  type NewMarketCreateResult,
  newMarketCreateSchema,
} from "@/lib/markets/create-input";
import type { MarketScheduleContext } from "@/lib/markets/schedule-context";
import { DEFAULT_SERP_DEPTH, type SerpDevice } from "@/lib/serp/constants";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { type ReactNode, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { NewMarketKeywordMethod, type NewMarketSource } from "./NewMarketKeywordMethod";
import { NewMarketSchedule, type NewMarketScheduleOption } from "./NewMarketSchedule";
import { NewMarketScheduleEditor } from "./NewMarketScheduleEditor";
import { NewMarketSheetFooter } from "./NewMarketSheetFooter";
import {
  defaults,
  deviceNote,
  deviceOptions,
  expectedKeywordCount,
  pasteState,
  selectedDevice,
} from "./new-market-creator-model";

export type NewMarketCreatorFrame = {
  content: ReactNode;
  creatingSchedule: boolean;
  footer: ReactNode;
  onBack: () => void;
  onClose: () => void;
  title: string;
};

export type NewMarketCreatorProps = {
  /** Create an empty market when the host owns keywords and their tracking defaults. */
  definitionOnly?: { devices: readonly SerpDevice[] };
  children: (frame: NewMarketCreatorFrame) => ReactNode;
  onClose: () => void;
  onCreate: (input: NewMarketCreateInput) => Promise<NewMarketCreateResult>;
  /** Receives the created market so a host can select it without waiting for a refresh. */
  onCreated?: (result: NewMarketCreateResult) => void;
  onScheduleCreated?: (schedule: NewMarketScheduleOption) => void;
  projectId: string;
  registry?: readonly MarketDefinitionRegistryEntry[];
  schedules: readonly NewMarketScheduleOption[];
  scheduleContext?: MarketScheduleContext;
  /** Where the definition block gets countries, languages and places; the catalog by default. */
  source?: MarketDefinitionLocationSource;
  sources: readonly NewMarketSource[];
};

export function NewMarketCreator({
  children,
  definitionOnly,
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
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [createdSchedules, setCreatedSchedules] = useState<NewMarketScheduleOption[]>([]);
  const [createdDefaultName, setCreatedDefaultName] = useState<string | null>(null);
  const context = scheduleContext ?? {
    connectedProviders: [],
    defaultScheduleName: schedules[0]?.name ?? null,
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
  const form = useForm<NewMarketCreateInput>({
    defaultValues: defaultValues as never,
    resolver: zodResolver(newMarketCreateSchema),
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
  const prospectiveCount = expectedKeywordCount(method, sources, paste.count, devices);
  const baseValid = Boolean(canonicalKey && devices?.length);
  const methodValid =
    method?.kind === "empty" ||
    (method?.kind === "copy" && Boolean(method.sourceMarketId) && Boolean(schedule)) ||
    (method?.kind === "paste" && paste.error === null && paste.count > 0 && Boolean(schedule));
  const duplicate = registry.some((entry) => entry.canonicalKey === canonicalKey);
  const createDisabled = form.formState.isSubmitting || !baseValid || !methodValid || duplicate;

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
      const created = await onCreate(
        definitionOnly ? { ...input, devices: [...definitionOnly.devices] } : input,
      );
      onCreated?.(created);
      close();
    } catch (cause) {
      setActionError(actionErrorMessage(cause, "Market could not be created."));
    }
  }

  return children({
    creatingSchedule,
    onBack: () => (creatingSchedule ? setCreatingSchedule(false) : close()),
    onClose: close,
    title: creatingSchedule ? "New schedule" : "New market",
    footer: creatingSchedule ? undefined : (
      <NewMarketSheetFooter
        createDisabled={createDisabled}
        onClose={close}
        pending={form.formState.isSubmitting}
        prospectiveCount={definitionOnly ? undefined : prospectiveCount}
      />
    ),
    content: creatingSchedule ? (
      <NewMarketScheduleEditor
        context={{
          ...context,
          defaultScheduleName: createdDefaultName ?? context.defaultScheduleName,
        }}
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
            isDefault: saved.isDefault,
          });
          if (saved.isDefault) setCreatedDefaultName(saved.name);
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
        <p className="m-0 text-[13px] text-fg-muted">
          A location and a language you track together.
        </p>
        <fieldset className="contents" disabled={form.formState.isSubmitting}>
          <MarketDefinition
            duplicate={null}
            onChange={updateDefinition}
            registry={registry}
            source={locationSource}
            value={definition}
          />
          {!definitionOnly ? (
            <div className="grid gap-1.5">
              <FieldLabel label="Devices" />
              <MenuSelect
                ariaLabel="Devices"
                onChange={updateDevices}
                options={deviceOptions}
                size="input"
                value={selectedDevice(devices)}
              />
              <p className="m-0 text-[12px] text-fg-muted">{deviceNote(devices)}</p>
            </div>
          ) : null}
          {!definitionOnly ? (
            <NewMarketKeywordMethod
              onChange={updateMethod}
              pasteError={paste.error}
              sources={sources}
              value={method}
            />
          ) : null}
          {!definitionOnly && method && method.kind !== "empty" ? (
            <NewMarketSchedule
              onChange={(next) =>
                form.setValue("schedule", next, { shouldDirty: true, shouldValidate: true })
              }
              onNewSchedule={() => setCreatingSchedule(true)}
              schedules={availableSchedules}
              value={schedule}
            />
          ) : null}
        </fieldset>
        {actionError || form.formState.errors.name?.message ? (
          <p className="m-0 text-[12px] text-red-text" role="alert">
            {actionError ?? form.formState.errors.name?.message}
          </p>
        ) : null}
      </form>
    ),
  });
}
