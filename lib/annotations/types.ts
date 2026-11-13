export const ANNOTATION_WINDOW_DAYS = 90;

export const annotationFilters = ["all", "note", "google", "deploy", "content", "sitemap"] as const;

export type AnnotationFilter = (typeof annotationFilters)[number];

export type AnnotationKind = Exclude<AnnotationFilter, "all">;

export type AnnotationMarker = "C" | "D" | "G" | "N" | "S";

export const annotationMarkerByKind = {
  content: "C",
  deploy: "D",
  google: "G",
  note: "N",
  sitemap: "S",
} as const satisfies Record<AnnotationKind, AnnotationMarker>;

export type AnnotationSignalRecord = {
  actor: string | null;
  happenedAt: string;
  id: string;
  payload: Record<string, unknown> | null;
  source: string;
  type: string;
  url: string | null;
};

export type AnnotationUpdateRecord = {
  beginsAt: string;
  endsAt: string | null;
  id: string;
  name: string;
  service: string;
  uri: string;
};

export type AnnotationsView = {
  now: string;
  signals: AnnotationSignalRecord[];
  timeZone: string;
  updates: AnnotationUpdateRecord[];
  windowStart: string;
};

export type AnnotationEntry = {
  automatic: boolean;
  detail: string;
  endsAt: string | null;
  happenedAt: string;
  href: string | null;
  id: string;
  kind: AnnotationKind;
  marker: AnnotationMarker;
  range: string | null;
  removable: boolean;
  sourceLabel: string;
  subtitle: string;
  title: string;
};

export function annotationWindow(now: Date) {
  const end = new Date(now);
  const start = new Date(now.getTime() - ANNOTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { end, start };
}

/** Maps stored landing value `timeline` and old filter names onto the annotations view. */
export function annotationFilterFromQuery(value: string | undefined): AnnotationFilter {
  if (value === "note" || value === "notes") return "note";
  if (value === "deploy" || value === "deploys") return "deploy";
  if (value === "google" || value === "content" || value === "sitemap") return value;
  return "all";
}

export function visibleAnnotations(
  entries: readonly AnnotationEntry[],
  filter: AnnotationFilter,
  hideAutomatic: boolean,
) {
  return entries.filter((entry) => {
    if (hideAutomatic && entry.automatic) return false;
    return filter === "all" || entry.kind === filter;
  });
}
