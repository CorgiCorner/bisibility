export type ResearchRelativeTimeMessages = {
  daysAgo: (values: { count: number }) => string;
  hoursAgo: (values: { count: number }) => string;
  justNow: () => string;
  minutesAgo: (values: { count: number }) => string;
  yesterday: () => string;
};

/** Keeps raw elapsed units available to the feature catalog until presentation. */
export function researchRelativePast(
  date: Date,
  now: Date,
  messages: ResearchRelativeTimeMessages,
) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return messages.justNow();
  if (minutes < 60) return messages.minutesAgo({ count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return messages.hoursAgo({ count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? messages.yesterday() : messages.daysAgo({ count: days });
}
