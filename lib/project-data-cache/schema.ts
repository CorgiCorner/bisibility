import { z } from "zod";
import type { CacheModule } from "./key";
export const ttlOptions = [3600, 21600, 43200, 86400, 259200, 604800, 1209600, 2592000] as const;
export const cacheSettingsSchema = z.object({
  projectId: z.string().min(1).max(128),
  ttlSeconds: z.union([
    z.literal(null),
    z
      .number()
      .int()
      .refine((value) => ttlOptions.includes(value as (typeof ttlOptions)[number])),
  ]),
  expectedTtlSeconds: z.number().int().nullable(),
});
export const cacheListSchema = z.object({
  projectId: z.string().min(1).max(128),
  cursor: z.string().max(2048).default("0"),
});
export const cacheDeleteSchema = z.object({
  projectId: z.string().min(1).max(128),
  token: z.string().min(1).max(4096),
});
export type DataCacheEntry = {
  token: string;
  keyword: string | null;
  module: CacheModule;
  provider?: string;
  reportRef?: string;
  source:
    | "related"
    | "suggestion"
    | "idea"
    | "metrics"
    | "backlinks"
    | "overview"
    | "history"
    | "keywords"
    | "pages"
    | "ai_visibility"
    | "prompt_explorer"
    | "site_audit";
  country: string;
  language: string;
  expiresAt: string;
};
export type DataCachePage = {
  entries: DataCacheEntry[];
  cursor: string;
  available: boolean;
};
