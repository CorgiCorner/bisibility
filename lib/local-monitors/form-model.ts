import { definitionAuthoringSchema } from "@/lib/local-monitor-store/definition-schema";
import type { z } from "zod";
import type { MonitorDetail } from "./contracts";

// Client and server share the exact coordinate and definition validator.
export const monitorFormSchema = definitionAuthoringSchema;
export type MonitorFormValues = z.input<typeof monitorFormSchema>;
export function monitorFormDefaults(current?: MonitorDetail | null): MonitorFormValues {
  if (current)
    return {
      name: current.name,
      locationId: current.locationId,
      identityRevisionId: current.identityRevisionId,
      keywordIds: current.keywords.map(({ id }) => id),
      grid: {
        ...current.grid.center,
        size: current.grid.size,
        spacingMetres: current.grid.spacingMetres,
      },
      axes: { ...current.axes },
    };
  return {
    name: "",
    locationId: "",
    identityRevisionId: "",
    keywordIds: [],
    grid: { latitude: "", longitude: "", size: 1, spacingMetres: 100 },
    axes: {
      engine: "google",
      surface: "maps",
      resultKind: "map_listing",
      rankScale: "maps_organic",
      language: "",
      device: "desktop",
      operatingSystem: null,
      cutoff: 20,
      zoom: null,
    },
  };
}
