export type DeindexChange = {
  at: Date;
  next: unknown;
  previous: unknown;
  url: string;
};

export type DeindexSignal = {
  at: Date;
  id: string;
  payload: unknown;
  url: string | null;
};

export type DeindexRow = {
  annotationId: string | null;
  at: string;
  reason: string | null;
  url: string;
};

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function verdict(value: unknown) {
  return text(record(value)?.verdict);
}

function reasonFrom(value: unknown) {
  return text(record(value)?.coverageState);
}

type Draft = { annotationId: string | null; at: Date; reason: string | null; url: string };

/** Indexed to not indexed in the window, newest first. Signals supply the Annotations link. */
export function deindexRows(input: {
  changes: readonly DeindexChange[];
  signals: readonly DeindexSignal[];
  since: Date;
}): DeindexRow[] {
  const byUrl = new Map<string, Draft>();
  const keep = (next: Draft) => {
    const current = byUrl.get(next.url);
    if (!current || next.at > current.at) {
      byUrl.set(next.url, {
        annotationId: next.annotationId ?? current?.annotationId ?? null,
        at: next.at,
        reason: next.reason ?? current?.reason ?? null,
        url: next.url,
      });
      return;
    }
    if (!current.annotationId && next.annotationId) current.annotationId = next.annotationId;
    if (!current.reason && next.reason) current.reason = next.reason;
  };

  for (const change of input.changes) {
    if (change.at < input.since) continue;
    if (verdict(change.previous) !== "PASS") continue;
    const next = verdict(change.next);
    if (!next || next === "PASS") continue;
    keep({
      annotationId: null,
      at: change.at,
      reason: reasonFrom(change.next),
      url: change.url,
    });
  }
  for (const signal of input.signals) {
    if (!signal.url || signal.at < input.since) continue;
    keep({
      annotationId: signal.id,
      at: signal.at,
      reason: reasonFrom(signal.payload),
      url: signal.url,
    });
  }

  return [...byUrl.values()]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.url.localeCompare(b.url))
    .map((row) => ({
      annotationId: row.annotationId,
      at: row.at.toISOString(),
      reason: row.reason,
      url: row.url,
    }));
}

export function indexingPagePath(url: string) {
  try {
    const path = new URL(url).pathname;
    return path || "/";
  } catch {
    return url;
  }
}
