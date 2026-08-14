export type DateFormatPreference = "eu" | "iso" | "long";

export type DateTimeFormatContext = {
  dateFormat?: DateFormatPreference;
  timezone: string;
};

const DEFAULT_DATE_FORMAT = "iso" satisfies DateFormatPreference;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function partsFor(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
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

export function createUserDateTimeFormatter({
  dateFormat = DEFAULT_DATE_FORMAT,
  timezone,
}: DateTimeFormatContext) {
  const longDate = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: timezone,
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
  });

  function formatDate(date: Date) {
    if (dateFormat === "long") {
      return longDate.format(date);
    }

    const { day, month, year } = partsFor(date, timezone);
    if (dateFormat === "eu") {
      return `${pad(day)}/${pad(month)}/${year}`;
    }

    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function formatRelativeDay(date: Date, now: Date) {
    const diff = dayOrdinal(now, timezone) - dayOrdinal(date, timezone);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return formatDate(date);
  }

  return {
    formatDate,
    formatDateTime: (date: Date) => `${formatDate(date)}, ${time.format(date)}`,
    formatRelativeDay,
    formatTime: (date: Date) => time.format(date),
    timezone,
  };
}
