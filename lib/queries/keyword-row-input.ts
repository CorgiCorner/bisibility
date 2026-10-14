import type { ExpectedUrlResolution } from "@/lib/expected-url/types";
import type { CapturedObservation } from "@/lib/rank-measurements/recorded-check";
import type { KeywordLocation } from "./keyword-location";
import type { KeywordSchedule } from "./keyword-row-types";
export type ScheduleSource = {
  cronExpression: string | null;
  frequency: KeywordSchedule["frequency"];
  jitterMinutes: number;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  serpDepth?: number | null;
  timezone: string;
};
type CheckScheduleSource = { name: string; publicId: string; serpDepth?: number | null };

export type KeywordProject = { defaults: ScheduleSource | null; domain: string };
type UrlPresenceSource = {
  canonicalOk: boolean | null;
  checkedAt: Date;
  coverageState: string | null;
  lastCrawlAt: Date | null;
  url: string;
  verdict: string | null;
};
export type KeywordRowInput = {
  alertTargets?: {
    rule: {
      conditionType: string;
      enabled: boolean;
      thresholdPosition: number | null;
      topN: number | null;
      updatedAt: Date;
    };
  }[];
  createdAt: Date;
  checkSchedule?: CheckScheduleSource | null;
  device: string;
  id: string;
  intent: string | null;
  location: string;
  locationRef: {
    canonicalKey: string;
    cityName: string | null;
    countryCode: string;
    displayName: string;
    gl: string;
    hl: string;
    id: string;
    kind: KeywordLocation["kind"];
    languageLabel?: string;
  };
  publicId: string;
  expectedUrlResolution?: ExpectedUrlResolution;
  queuedRankCheckTasks?: { state: string }[];
  rankChecks: {
    checkedAt: Date;
    degradedToCountry?: boolean;
    errorCode: string | null;
    expectedUrlAtCheck?: string | null;
    id: string;
    normalizationVersion: string | null;
    observationRun?: CapturedObservation | null;
    position: number | null;
    provider: string;
    previousPosition: number | null;
    rankingUrl: string | null;
    requestedDepth: number | null;
    status?: string;
  }[];
  schedule: ScheduleSource | null;
  tags: { tag: { name: string } }[];
  targetUrl: string | null;
  text: string;
  topic: string | null;
  urlPresence?: UrlPresenceSource | null;
};
