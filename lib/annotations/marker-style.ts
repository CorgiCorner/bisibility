import { type AnnotationKind, type AnnotationMarker, annotationMarkerByKind } from "./types";

/** Chart kinds use search_engine for the same Google rollout the annotations page calls google. */
export const chartMarkerKinds = ["note", "deploy", "content", "sitemap", "search_engine"] as const;

export type ChartMarkerKind = (typeof chartMarkerKinds)[number];

/** Catalog keys shared with the annotations page. A set key is translated at render time. */
export const chartMarkerGeneratedTitles = [
  "contentFallback",
  "deindexedTitle",
  "deployFallback",
  "noteFallback",
  "primaryConversion",
  "sitemapTitle",
] as const;

export type ChartMarkerGeneratedTitle = (typeof chartMarkerGeneratedTitles)[number];

export type ChartMarker = {
  added?: number;
  dateKey: string;
  endDateKey?: string;
  from?: string;
  generated?: ChartMarkerGeneratedTitle;
  id: string;
  kind: ChartMarkerKind;
  removed?: number;
  /** Annotation subtitle, such as a deploy environment or the person who wrote a note. */
  source?: string;
  /** Verbatim user note or Google update name. Empty when `generated` is set. */
  title: string;
  to?: string;
};

export const markerToneContent = "text-purple-text";
export const markerToneDeploy = "text-red-text";
export const markerToneSearchEngine = "text-blue-text";
export const markerToneNote = "text-yellow-text";
export const markerToneSitemap = "text-green-text";

const toneByLetter = {
  C: markerToneContent,
  D: markerToneDeploy,
  G: markerToneSearchEngine,
  N: markerToneNote,
  S: markerToneSitemap,
} as const satisfies Record<AnnotationMarker, string>;

const fillByLetter = {
  C: "var(--purple)",
  D: "var(--red)",
  G: "var(--blue)",
  N: "var(--yellow)",
  S: "var(--green)",
} as const satisfies Record<AnnotationMarker, string>;

const legendOrder = ["note", "deploy", "content", "sitemap", "search_engine"] as const;

export const chartMarkerLegendKinds = legendOrder;

export function markerLetter(kind: AnnotationKind | ChartMarkerKind): AnnotationMarker {
  if (kind === "google" || kind === "search_engine") return "G";
  return annotationMarkerByKind[kind];
}

function letterOf(kindOrLetter: AnnotationKind | ChartMarkerKind | AnnotationMarker) {
  if (kindOrLetter in toneByLetter) return kindOrLetter as AnnotationMarker;
  return markerLetter(kindOrLetter as AnnotationKind | ChartMarkerKind);
}

export function markerFill(kindOrLetter: AnnotationKind | ChartMarkerKind | AnnotationMarker) {
  return fillByLetter[letterOf(kindOrLetter)];
}

export function chartMarkerKind(kind: AnnotationKind): ChartMarkerKind {
  return kind === "google" ? "search_engine" : kind;
}

export function markerToneClass(kind: ChartMarkerKind | null) {
  if (kind === "content") return markerToneContent;
  if (kind === "deploy") return markerToneDeploy;
  if (kind === "note") return markerToneNote;
  if (kind === "search_engine") return markerToneSearchEngine;
  if (kind === "sitemap") return markerToneSitemap;
  return "text-fg";
}
