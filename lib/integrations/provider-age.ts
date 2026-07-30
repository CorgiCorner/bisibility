export function providerAgeLabel(date: Date | null | undefined, now: Date) {
  if (!date) return "Never";
  const hours = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3_600_000));
  return hours < 1 ? "Just now" : `${hours}h ago`;
}
