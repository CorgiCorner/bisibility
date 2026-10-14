export const LOCAL_CONTRACT_VERSION = 1;
export const GEOMETRY_MODEL = "sphere-r6371000-v1";
export const COORDINATE_PRECISION = 7;

export type Coordinate = Readonly<{ latitude: string; longitude: string }>;
export type PointRevision = Readonly<{
  version: 1;
  revisionId: string;
  revisionKey: string;
  contentHash: string;
  coordinate: Coordinate;
  precision: 7;
  geometryModel: typeof GEOMETRY_MODEL;
}>;
export type GridPoint = Readonly<{
  ordinal: number;
  row: number;
  column: number;
  point: PointRevision;
}>;
export type GridRevision = Readonly<{
  version: 1;
  revisionId: string;
  revisionKey: string;
  contentHash: string;
  center: Coordinate;
  size: 1 | 3 | 5 | 7;
  spacingMetres: number;
  precision: 7;
  geometryModel: typeof GEOMETRY_MODEL;
  points: readonly GridPoint[];
}>;
export type LocalSurface = "web_serp" | "maps" | "local_finder";
export type LocalResultKind = "local_pack" | "map_listing" | "listing";
export type LocalRankScale = "pack_slot" | "maps_organic" | "finder_organic" | "finder_group";

export type ExecutionTargetV1 = Readonly<{
  version: 1;
  projectId: string;
  keywordId: string;
  keywordRevision: string;
  pointRevision: string;
  engine: "google";
  surface: LocalSurface;
  resultKind: LocalResultKind;
  rankScale: LocalRankScale;
  language: string;
  device: "desktop" | "mobile";
  operatingSystem: string | null;
  cutoff: number;
  zoom: number | null;
  policyRevision: string;
}>;
export type ProjectionV1 = Readonly<{
  version: 1;
  executionTargetKey: string;
  entityRevision: string;
  matcherVersion: string;
  normalizationVersion: string;
}>;
export type OperationScope = Readonly<{
  projectId: string;
  operation: "local_scan_submit";
  idempotencyKey: string;
}>;
