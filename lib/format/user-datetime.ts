export type DateFormatPreference = "eu" | "iso" | "long";
export type LanguagePreference = "de" | "en" | "pl";

export type DateTimePreferences = {
  dateFormat: DateFormatPreference;
  language: LanguagePreference;
  timezone: string;
};

const defaultPreferences = {
  dateFormat: "iso",
  language: "en",
  timezone: "Europe/Warsaw",
} satisfies DateTimePreferences;

const localeByLanguage = {
  de: "de-DE",
  en: "en-US",
  pl: "pl-PL",
} satisfies Record<LanguagePreference, string>;

const relativeDayCopy = {
  de: { today: "Heute", yesterday: "Gestern" },
  en: { today: "Today", yesterday: "Yesterday" },
  pl: { today: "Dzisiaj", yesterday: "Wczoraj" },
} satisfies Record<LanguagePreference, { today: string; yesterday: string }>;

function preferencesFor(preferences?: Partial<DateTimePreferences>): DateTimePreferences {
  return { ...defaultPreferences, ...preferences };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function partsFor(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function dayOrdinal(date: Date, timeZone: string) {
  const { day, month, year } = partsFor(date, timeZone);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function createUserDateTimeFormatter(preferences?: Partial<DateTimePreferences>) {
  const resolved = preferencesFor(preferences);
  const locale = localeByLanguage[resolved.language] ?? localeByLanguage.en;
  const longDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: resolved.timezone,
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: resolved.timezone,
  });

  function formatDate(date: Date) {
    if (resolved.dateFormat === "long") {
      return longDate.format(date);
    }

    const { day, month, year } = partsFor(date, resolved.timezone);
    if (resolved.dateFormat === "eu") {
      return `${pad(day)}/${pad(month)}/${year}`;
    }

    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function formatRelativeDay(date: Date, now: Date) {
    const diff = dayOrdinal(now, resolved.timezone) - dayOrdinal(date, resolved.timezone);
    if (diff === 0) return relativeDayCopy[resolved.language].today;
    if (diff === 1) return relativeDayCopy[resolved.language].yesterday;
    return formatDate(date);
  }

  return {
    formatDate,
    formatDateTime: (date: Date) => `${formatDate(date)}, ${time.format(date)}`,
    formatRelativeDay,
    formatTime: (date: Date) => time.format(date),
    preferences: resolved,
  };
}
