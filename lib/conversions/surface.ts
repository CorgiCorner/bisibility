import type { CostTiles } from "@/lib/cost-items/tiles";
import type { ResolvedConversionSource } from "./selection";
import type { ConversionSource } from "./types";

export type ConversionLandingPage = {
  conversions: number;
  path: string;
  rate: number | null;
  sessions: number | null;
};

export type ConversionReport =
  | { kind: "connect"; selection: ResolvedConversionSource }
  | {
      current: number;
      goalCount: number;
      kind: "ready";
      pages: ConversionLandingPage[];
      previous: number;
      selection: ResolvedConversionSource;
      series: { date: string; totalCount: number }[];
      source: ConversionSource;
      sourceLabel: string;
    };

export type OrganicConversionsWidget =
  | { kind: "connect" }
  | { kind: "error" }
  | {
      current: number;
      goalCount: number;
      kind: "ready";
      pages: { conversions: number; path: string }[];
      previous: number;
      selection: ResolvedConversionSource;
      series: { date: string; totalCount: number }[];
      source: ConversionSource;
      sourceLabel: string;
    };

export type SeoCostWidget = { kind: "error" } | { kind: "ready"; month: string; tiles: CostTiles };
