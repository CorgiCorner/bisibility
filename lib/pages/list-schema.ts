import { CONVERSION_SOURCES } from "@/lib/conversions/types";
import { z } from "zod";
import {
  pageStatusFilters,
  projectPageCoverageState,
  projectPageCwvFilters,
  projectPageIndexGroups,
  projectPageSortKeys,
  projectPageSourceKinds,
} from "./types";

const projectSchema = z.object({ projectId: z.string().trim().min(1).max(120) });
export const projectPagesLoadSchema = projectSchema.extend({
  conv: z.enum(CONVERSION_SOURCES).optional(),
  dir: z.enum(["asc", "desc"]),
  index: z.enum(projectPageIndexGroups).optional(),
  coverage: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine((value) => projectPageCoverageState(value) === value)
    .optional(),
  cwv: z.enum(projectPageCwvFilters).optional(),
  page: z.number().int().min(1).max(10_000),
  period: z.enum(["7", "28", "90"]),
  search: z.string().trim().max(200).optional(),
  sitemap: z.enum(["listed", "not_listed"]).optional(),
  sort: z.enum(projectPageSortKeys),
  source: z.enum(projectPageSourceKinds).optional(),
  status: z.enum(pageStatusFilters).optional(),
  tag: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/u)
    .max(80)
    .optional(),
});
