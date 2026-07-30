const DAY_MS = 86_400_000;

// Shared relative label keeps pending server-detail and client-list states consistent.
export function addedLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return "recently";
  }
  const days = Math.floor((Date.now() - then.getTime()) / DAY_MS);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w ago`;
  }
  return then.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function formatVolume(volume: number): string {
  if (volume >= 10_000) {
    return `${(volume / 1000).toFixed(0)}k`;
  }
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k`;
  }
  return String(volume);
}
