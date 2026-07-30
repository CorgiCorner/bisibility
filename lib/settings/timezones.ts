type MenuSelectOption = { label: string; value: string };

type TimezoneOption = MenuSelectOption & { offsetMinutes: number };

const FALLBACK_TIMEZONES = ["UTC", "Europe/Warsaw", "America/New_York"] as const;
const MINUTE_MS = 60_000;

type CatalogueCache = {
  minute: number;
  options: MenuSelectOption[];
  supportedValuesOf: typeof Intl.supportedValuesOf | undefined;
};

let catalogueCache: CatalogueCache | undefined;

function offsetLabel(timeZone: string, reference: Date) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(reference)
    .find((part) => part.type === "timeZoneName")?.value;

  return label === "GMT" ? "GMT+00:00" : (label ?? "GMT+00:00");
}

function offsetInMinutes(label: string) {
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(label);
  if (!match) {
    return 0;
  }

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function timezoneOption(timeZone: string, reference: Date): TimezoneOption {
  const offset = offsetLabel(timeZone, reference);
  return {
    label: `${timeZone} (${offset})`,
    offsetMinutes: offsetInMinutes(offset),
    value: timeZone,
  };
}

function supportedTimezones() {
  if (typeof Intl.supportedValuesOf !== "function") {
    return [...FALLBACK_TIMEZONES];
  }

  return ["UTC", ...Intl.supportedValuesOf("timeZone")];
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function timezoneCatalogue(reference: Date) {
  const minute = Math.floor(reference.getTime() / MINUTE_MS);
  const supportedValuesOf = Intl.supportedValuesOf;
  if (catalogueCache?.minute === minute && catalogueCache.supportedValuesOf === supportedValuesOf) {
    return catalogueCache.options;
  }

  const offsetReference = new Date(minute * MINUTE_MS);
  const [utc, ...zones] = unique(supportedTimezones()).map((timeZone) =>
    timezoneOption(timeZone, offsetReference),
  );
  const options = [
    utc,
    ...zones.sort(
      (left, right) =>
        left.offsetMinutes - right.offsetMinutes || left.value.localeCompare(right.value, "en"),
    ),
  ].map(({ label, value }) => ({ label, value }));

  catalogueCache = { minute, options, supportedValuesOf };
  return options;
}

export function isSupportedTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function timezoneSelectOptions(
  current: string,
  reference: Date = new Date(),
): MenuSelectOption[] {
  const options = timezoneCatalogue(reference);

  if (options.some((option) => option.value === current)) {
    return options;
  }

  try {
    const { label, value } = timezoneOption(current, reference);
    return [{ label, value }, ...options];
  } catch {
    return [{ label: current, value: current }, ...options];
  }
}
