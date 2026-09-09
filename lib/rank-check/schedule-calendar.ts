export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
function ordinal(value: number) {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

export const monthDays = Array.from({ length: 28 }, (_, index) => ordinal(index + 1)) as [
  string,
  ...string[],
];

const weekdayNumberByName = {
  Friday: 5,
  Monday: 1,
  Saturday: 6,
  Sunday: 0,
  Thursday: 4,
  Tuesday: 2,
  Wednesday: 3,
} as const;

export function calendarCronExpression(values: {
  dayOfMonth: string;
  frequency: string;
  timeOfDay: string;
  weekday: (typeof weekdays)[number];
}) {
  if (values.frequency !== "weekly" && values.frequency !== "monthly") return null;
  if (!values.timeOfDay) return null;
  const [hour, minute] = values.timeOfDay.split(":").map(Number);
  const calendarField =
    values.frequency === "weekly"
      ? `* * ${weekdayNumberByName[values.weekday]}`
      : `${Number.parseInt(values.dayOfMonth, 10)} * *`;
  return `${minute} ${hour} ${calendarField}`;
}
