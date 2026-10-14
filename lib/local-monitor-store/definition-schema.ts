import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { canonicalCoordinate } from "@/lib/local-monitoring/coordinates";
import {
  localOperatingSystems,
  MAPS_REQUEST_SCOPE,
} from "@/lib/local-monitoring/maps-request-scope";
import { createTargetSchema, localToken } from "@/lib/local-monitoring-store/target-input-schema";
import { z } from "zod";
import { monitorPilotGridSupported } from "./pilot-grid";

function coordinateInput(axis: "latitude" | "longitude") {
  return z
    .string()
    .min(1)
    .max(32)
    .superRefine((value, ctx) => {
      try {
        canonicalCoordinate(axis === "latitude" ? value : "0", axis === "longitude" ? value : "0");
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Enter decimal coordinates with at most seven places in range.",
        });
      }
    });
}

const publicKeyword = z.string().refine((value) => isPublicIdOfType(value, "kw"));
export const monitorAxesSchema = createTargetSchema
  .omit({ projectId: true, keywordId: true, latitude: true, longitude: true })
  .extend({ surface: z.enum(["maps", "local_finder"]) })
  .superRefine((value, ctx) => {
    if (
      value.surface === "maps"
        ? value.resultKind !== "map_listing" || value.rankScale !== "maps_organic"
        : value.resultKind !== "listing" || value.rankScale !== "finder_organic"
    ) {
      ctx.addIssue({ code: "custom", message: "Surface and rank semantics must agree." });
    }
  });
export const definitionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    locationId: z.string().refine((value) => isPublicIdOfType(value, "biz")),
    identityRevisionId: localToken,
    keywordIds: z
      .array(publicKeyword)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    grid: z
      .object({
        latitude: coordinateInput("latitude"),
        longitude: coordinateInput("longitude"),
        size: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
        spacingMetres: z.int().min(1).max(100_000),
      })
      .strict(),
    axes: monitorAxesSchema,
  })
  .strict()
  .refine(
    (value) => value.keywordIds.length * value.grid.size ** 2 <= 100,
    "The frozen selection exceeds the existing 100-target admission limit.",
  );
export type MonitorDefinitionInput = z.input<typeof definitionInputSchema>;

/** New Maps revisions must be executable; retained definitions keep their original nullable axes. */
export const definitionAuthoringSchema = definitionInputSchema.superRefine(
  ({ axes, grid }, ctx) => {
    if (!monitorPilotGridSupported(grid.size))
      ctx.addIssue({
        code: "custom",
        path: ["grid", "size"],
        message: "Larger grids require a separate pilot approval.",
      });
    if (axes.surface !== "maps") return;
    const systems: readonly string[] = localOperatingSystems(axes.device);
    const checks = [
      ["operatingSystem", axes.operatingSystem !== null && systems.includes(axes.operatingSystem)],
      [
        "zoom",
        axes.zoom !== null &&
          Number.isSafeInteger(axes.zoom) &&
          axes.zoom >= MAPS_REQUEST_SCOPE.zoomRange[0] &&
          axes.zoom <= MAPS_REQUEST_SCOPE.zoomRange[1],
      ],
      ["cutoff", axes.cutoff <= MAPS_REQUEST_SCOPE.maxCutoff],
      ["language", MAPS_REQUEST_SCOPE.languages.some((language) => language === axes.language)],
    ] as const;
    for (const [field, valid] of checks) {
      if (!valid)
        ctx.addIssue({
          code: "custom",
          path: ["axes", field],
          message: "Choose an explicit supported Maps request option.",
        });
    }
  },
);
