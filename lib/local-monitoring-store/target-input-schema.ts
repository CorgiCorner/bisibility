import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import { z } from "zod";

export const localToken = z
  .string()
  .min(1)
  .max(512)
  .refine((v) => v.trim() === v && !hasAsciiControlCharacters(v));
export const projectRef = z.string().refine((v) => isPublicIdOfType(v, "prj"));
export const createTargetSchema = z
  .object({
    projectId: projectRef,
    keywordId: z.string().refine((v) => isPublicIdOfType(v, "kw")),
    latitude: z.string().min(1).max(64),
    longitude: z.string().min(1).max(64),
    engine: z.literal("google"),
    surface: z.enum(["web_serp", "maps", "local_finder"]),
    resultKind: z.enum(["local_pack", "map_listing", "listing"]),
    rankScale: z.enum(["pack_slot", "maps_organic", "finder_organic", "finder_group"]),
    language: localToken,
    device: z.enum(["desktop", "mobile"]),
    operatingSystem: localToken.nullable(),
    cutoff: z.number().int().positive().max(100),
    zoom: z.number().finite().min(0).max(23).nullable(),
  })
  .strict();
