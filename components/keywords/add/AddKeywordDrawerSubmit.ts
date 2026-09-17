import {
  type ExistingKeyword,
  newCsvKeywordRows,
} from "@/components/keywords/AddKeywordCsvReviewModel";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  type AddKeywordDrawerForm,
  type AddKeywordTab,
  hasPerLineTarget,
  keywordTargetLineError,
  parseKeywordTargetLines,
} from "@/lib/keywords/add-keyword-drawer-shared";
import type { AddKeywordsInput, AddKeywordsMatrixInput } from "@/lib/schemas/keyword";
import { buildDrawerCsvKeywordRowsForForm, type DrawerCsvKeywordRow } from "./AddKeywordCsvRows";
import { pausedSchedule } from "./AddKeywordDrawerLocation";

type DrawerInputArgs = {
  activeTab: AddKeywordTab;
  /** The project schedule the reader assigned to these rows, if any. */
  checkScheduleId?: string | null;
  csvRows?: DrawerCsvKeywordRow[];
  csvText: string;
  devices: AddKeywordsMatrixInput["devices"];
  existingKeywords: readonly ExistingKeyword[];
  locationValue: LocationFieldValue;
  locationKeys: string[];
  values: AddKeywordDrawerForm;
};

export type AddKeywordDrawerWarning =
  | "alreadyTrackedRows"
  | "invalidCsvRows"
  | "invalidTargetLine"
  | "perLineTargetMarkets";

type DrawerInputResult =
  | { input: AddKeywordsInput | AddKeywordsMatrixInput }
  | { warning: AddKeywordDrawerWarning };

function scheduleFor(values: AddKeywordDrawerForm, checkScheduleId?: string | null) {
  if (checkScheduleId) return undefined;
  if (checkScheduleId === null)
    return {
      ...pausedSchedule,
      frequency: "manual" as const,
      serpDepth: values.schedule?.serpDepth,
      timezone: values.schedule?.timezone ?? "UTC",
    };
  return values.isPaused ? pausedSchedule : values.schedule;
}

function manualInput({
  checkScheduleId,
  devices,
  locationKeys,
  values,
}: DrawerInputArgs): DrawerInputResult {
  const parsed = parseKeywordTargetLines(values.keywords);
  if (keywordTargetLineError(parsed)) {
    return { warning: "invalidTargetLine" };
  }
  const entries = parsed.filter((entry) => entry.keyword);

  // Any per-line "keyword | url" override routes through the per-row path so each
  // keyword keeps its own target; the batch target URL is the fallback.
  if (hasPerLineTarget(parsed)) {
    return { warning: "perLineTargetMarkets" };
  }

  return {
    input: {
      ...(checkScheduleId ? { checkScheduleId } : {}),
      intent: values.intent,
      keywords: entries.map((entry) => entry.keyword),
      devices,
      locations: locationKeys.map((locationKey) => ({ locationKey })),
      projectId: values.projectId,
      schedule: scheduleFor(values, checkScheduleId),
      tags: values.tags ?? [],
      targetUrl: values.targetUrl,
      topic: values.topic,
    },
  };
}

function csvInput({
  checkScheduleId,
  csvRows,
  csvText,
  existingKeywords,
  locationValue,
  values,
}: DrawerInputArgs): DrawerInputResult {
  const rows = csvRows ?? buildDrawerCsvKeywordRowsForForm(csvText, values, locationValue);
  if (rows.some((row) => row.issues.length > 0)) {
    return { warning: "invalidCsvRows" };
  }
  const newRows = newCsvKeywordRows(rows, existingKeywords);
  if (newRows.length === 0) {
    return { warning: "alreadyTrackedRows" };
  }
  return {
    input: {
      ...(checkScheduleId ? { checkScheduleId } : {}),
      projectId: values.projectId,
      rows: newRows,
      schedule: scheduleFor(values, checkScheduleId),
    },
  };
}

export function addKeywordDrawerInput(args: DrawerInputArgs): DrawerInputResult {
  return args.activeTab === "csv" ? csvInput(args) : manualInput(args);
}
