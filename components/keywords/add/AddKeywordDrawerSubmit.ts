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
import { buildDrawerCsvKeywordRowsForForm } from "./AddKeywordCsvRows";
import { pausedSchedule } from "./AddKeywordDrawerLocation";

type DrawerInputArgs = {
  activeTab: AddKeywordTab;
  csvText: string;
  devices: AddKeywordsMatrixInput["devices"];
  existingKeywords: readonly ExistingKeyword[];
  locationValue: LocationFieldValue;
  locationKeys: string[];
  values: AddKeywordDrawerForm;
};

type DrawerInputResult = { input: AddKeywordsInput | AddKeywordsMatrixInput } | { warning: string };

function scheduleFor(values: AddKeywordDrawerForm) {
  return values.isPaused ? pausedSchedule : values.schedule;
}

function manualInput(
  values: AddKeywordDrawerForm,
  devices: AddKeywordsMatrixInput["devices"],
  locationKeys: string[],
): DrawerInputResult {
  const parsed = parseKeywordTargetLines(values.keywords);
  const lineError = keywordTargetLineError(parsed);
  if (lineError) {
    return { warning: lineError };
  }
  const entries = parsed.filter((entry) => entry.keyword);

  // Any per-line "keyword | url" override routes through the per-row path so each
  // keyword keeps its own target; the batch target URL is the fallback.
  if (hasPerLineTarget(parsed)) {
    return { warning: "Per-line target URLs cannot be combined with multiple markets." };
  }

  return {
    input: {
      intent: values.intent,
      keywords: entries.map((entry) => entry.keyword),
      devices,
      locations: locationKeys.map((locationKey) => ({ locationKey })),
      projectId: values.projectId,
      schedule: scheduleFor(values),
      tags: values.tags ?? [],
      targetUrl: values.targetUrl,
      topic: values.topic,
    },
  };
}

function csvInput({
  csvText,
  existingKeywords,
  locationValue,
  values,
}: DrawerInputArgs): DrawerInputResult {
  const rows = buildDrawerCsvKeywordRowsForForm(csvText, values, locationValue);
  if (rows.some((row) => row.issues.length > 0)) {
    return { warning: "Fix invalid CSV rows before confirming." };
  }
  const newRows = newCsvKeywordRows(rows, existingKeywords);
  if (newRows.length === 0) {
    return { warning: "All parsed keywords are already tracked for their location and device." };
  }
  return { input: { projectId: values.projectId, rows: newRows, schedule: scheduleFor(values) } };
}

export function addKeywordDrawerInput(args: DrawerInputArgs): DrawerInputResult {
  return args.activeTab === "csv"
    ? csvInput(args)
    : manualInput(args.values, args.devices, args.locationKeys);
}
