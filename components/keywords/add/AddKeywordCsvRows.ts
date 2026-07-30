import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { AddKeywordDrawerForm } from "@/lib/keywords/add-keyword-drawer-shared";
import { CsvParseError, parseKeywordImportCsvRows } from "@/lib/keywords/import-csv-parser";
import { type AddKeywordsRowInput, addKeywordsRowSchema } from "@/lib/schemas/keyword";
import { countryCodeForMarketName } from "@/lib/serp/location";
import type { SerpDevice } from "@/lib/serp/markets";
import { countryForSelection } from "./AddKeywordDrawerLocation";

export type CsvKeywordRowIssue = {
  message: string;
  row: number;
};

export type DrawerCsvKeywordRow = AddKeywordsRowInput & {
  issues: CsvKeywordRowIssue[];
  locationLabel: string;
  row: number;
  trackingLocationKey: string;
};

type CsvKeywordDefaults = {
  city?: string | null;
  device: SerpDevice;
  location: AddKeywordsRowInput["location"];
  locationKey?: string;
  locationLabel: string;
  tags: string[];
  targetUrl?: string | null;
  trackingLocationKey: string;
};

type CsvTrackingValues = {
  device: SerpDevice;
  locationValue: LocationFieldValue;
  tags: string[];
  targetUrl?: string | null;
};

function normalizeDevice(value: string | undefined, fallback: SerpDevice) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "desktop" || normalized === "mobile" ? normalized : fallback;
}

function issueMessage(issue: { message: string; path: PropertyKey[] }) {
  const field = issue.path[0];
  if (field === "device") return "Use desktop or mobile for device.";
  if (field === "locationKey") return "Use a canonical location key.";
  if (field === "location") return "Choose a supported SERP country.";
  if (field === "targetUrl") return "Target URL must be an absolute URL or a path.";
  return issue.message;
}

function targetUrl(value: string | undefined, fallback: string | null | undefined) {
  return value ?? fallback ?? undefined;
}

function countryTrackingKey(location: string, fallback: string) {
  return countryCodeForMarketName(location) ?? fallback;
}

function fallbackRow(
  input: AddKeywordsRowInput,
  defaults: CsvKeywordDefaults,
  row: number,
  locationLabel: string,
  issues: CsvKeywordRowIssue[],
): DrawerCsvKeywordRow {
  return {
    ...input,
    device: normalizeDevice(String(input.device), defaults.device),
    issues,
    location: defaults.location,
    locationLabel,
    row,
    trackingLocationKey: defaults.trackingLocationKey,
  };
}

function malformedCsvRow(error: CsvParseError, defaults: CsvKeywordDefaults): DrawerCsvKeywordRow {
  return {
    city: defaults.city ?? null,
    device: defaults.device,
    issues: [{ message: error.message, row: error.row }],
    keyword: "",
    location: defaults.location,
    locationKey: defaults.locationKey,
    locationLabel: defaults.locationLabel,
    row: error.row,
    tags: defaults.tags,
    targetUrl: defaults.targetUrl ?? undefined,
    trackingLocationKey: defaults.trackingLocationKey,
  };
}

export function buildDrawerCsvKeywordRows(
  csv: string,
  defaults: CsvKeywordDefaults,
): DrawerCsvKeywordRow[] {
  let rows: ReturnType<typeof parseKeywordImportCsvRows>;
  try {
    rows = parseKeywordImportCsvRows(csv);
  } catch (error) {
    if (error instanceof CsvParseError) return [malformedCsvRow(error, defaults)];
    throw error;
  }
  return rows.map((raw) => {
    const hasOwnLocation = Boolean(raw.city || raw.location);
    const hasRowLocation = Boolean(hasOwnLocation || raw.locationKey);
    const input = {
      city: raw.city ?? (hasRowLocation ? null : (defaults.city ?? null)),
      device: raw.device ?? defaults.device,
      intent: raw.intent,
      keyword: raw.keyword,
      location: raw.location ?? defaults.location,
      locationKey: raw.locationKey ?? (hasOwnLocation ? undefined : defaults.locationKey),
      tags: raw.tags ?? defaults.tags,
      targetUrl: targetUrl(raw.targetUrl, defaults.targetUrl),
      topic: raw.topic,
    };
    const result = addKeywordsRowSchema.safeParse(input);
    if (result.success) {
      return {
        ...result.data,
        issues: [],
        locationLabel:
          raw.locationKey ?? (hasOwnLocation ? result.data.location : defaults.locationLabel),
        row: raw.row,
        trackingLocationKey:
          result.data.locationKey ??
          (hasOwnLocation
            ? [
                countryTrackingKey(result.data.location, raw.location ?? ""),
                result.data.city?.trim(),
              ]
                .filter(Boolean)
                .join("\u0000")
            : defaults.trackingLocationKey),
      };
    }
    return fallbackRow(
      {
        ...input,
        device: normalizeDevice(raw.device, defaults.device),
        location: defaults.location,
      },
      defaults,
      raw.row,
      raw.locationKey ?? raw.location ?? defaults.locationLabel,
      result.error.issues.map((issue) => ({ message: issueMessage(issue), row: raw.row })),
    );
  });
}

function defaultsFromTracking({
  device,
  locationValue,
  tags,
  targetUrl,
}: CsvTrackingValues): CsvKeywordDefaults {
  return {
    city: locationValue.kind === "city" ? (locationValue.cityName ?? null) : null,
    device,
    location: countryForSelection(locationValue) as AddKeywordDrawerForm["location"],
    locationKey: locationValue.kind === "city" ? locationValue.canonicalKey : undefined,
    locationLabel: locationValue.displayName,
    tags,
    targetUrl,
    trackingLocationKey: locationValue.canonicalKey,
  };
}

export function buildDrawerCsvKeywordRowsForTracking(
  csv: string,
  values: CsvTrackingValues,
): DrawerCsvKeywordRow[] {
  return buildDrawerCsvKeywordRows(csv, defaultsFromTracking(values));
}

export function buildDrawerCsvKeywordRowsForForm(
  csv: string,
  values: AddKeywordDrawerForm,
  locationValue: LocationFieldValue,
): DrawerCsvKeywordRow[] {
  return buildDrawerCsvKeywordRows(csv, {
    city: values.city ?? null,
    device: values.device,
    location: values.location,
    locationKey: values.locationKey,
    locationLabel: locationValue.displayName,
    tags: values.tags ?? [],
    targetUrl: values.targetUrl,
    trackingLocationKey: locationValue.canonicalKey,
  });
}
