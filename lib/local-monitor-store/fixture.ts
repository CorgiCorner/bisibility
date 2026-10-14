import type { FrozenMonitorCalendar, MonitorKeyword } from "./model";
import type { MonitorDefinitionInput } from "./schema";

/** Synthetic authoring fixture; no provider capability or observed-result claim. */
export const monitorDefinitionFixture: MonitorDefinitionInput = {
  name: "Synthetic branch",
  locationId: "biz_abcdefghijklmnopqrstuvwx",
  identityRevisionId: "identity-revision-1",
  keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
  grid: { latitude: "52", longitude: "21", size: 3, spacingMetres: 100 },
  axes: {
    engine: "google",
    surface: "maps",
    resultKind: "map_listing",
    rankScale: "maps_organic",
    language: "en",
    device: "desktop",
    operatingSystem: "windows",
    cutoff: 20,
    zoom: 14,
  },
};
export const monitorKeywordFixture: MonitorKeyword = {
  id: "synthetic-keyword",
  publicId: monitorDefinitionFixture.keywordIds[0],
  text: "Synthetic dentist",
  device: "desktop",
  locationId: "synthetic-location",
  measurementTargetEpoch: "0",
  measurementPolicyEpoch: "0",
  sourceHash: "a".repeat(64),
};
export const monitorCalendarFixture: FrozenMonitorCalendar = {
  scheduleId: "synthetic-schedule",
  publicId: "sch_abcdefghijklmnopqrstuvwx",
  measurementEpoch: "0",
  frequency: "daily",
  cronExpression: null,
  timeOfDay: "10:00",
  timezone: "Europe/Warsaw",
  jitterMinutes: 0,
  serpDepth: 20,
  providerPolicy: null,
};
