import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";
import { researchHistorySurfaces } from "./contract";

const filterSchema = z
  .object({
    facet: z.enum(["device", "engine", "market", "mode", "pinned"]),
    value: z.string().trim().min(1).max(160),
  })
  .strict();

export const historyRequestSchema = z
  .object({
    cursor: z.string().trim().min(1).max(500).nullable(),
    filters: z.array(filterSchema).max(6),
    limit: z.literal(3).optional(),
    projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    query: z.string().trim().max(500),
  })
  .strict();

export const historyPinSchema = z
  .object({
    itemKey: z.string().trim().min(1).max(200),
    projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    surface: z.enum(researchHistorySurfaces),
  })
  .strict();

export const storedResearchSchema = z
  .object({
    projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    requestKey: z.string().trim().min(1).max(200),
  })
  .strict();
