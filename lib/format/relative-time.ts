export function relativePast(date: Date, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function relativeFuture(date: Date | null, now: Date) {
  if (!date) return "Not scheduled";
  const minutes = Math.ceil((date.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "due now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? `in ${hours}h` : `in ${Math.ceil(hours / 24)}d`;
}
