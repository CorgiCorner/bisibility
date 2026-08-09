import {
  DEFAULT_INSPECTION_DAILY_LIMIT,
  MAX_INSPECTION_DAILY_LIMIT,
} from "@/lib/presence/constants";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_DEVICE,
  DEFAULT_SERP_MARKET,
  type SerpDepth,
} from "@/lib/serp/markets";
import { z } from "zod";
import {
  canonicalKeySchema,
  deviceSchema,
  keywordScheduleBaseSchema,
  serpCitySchema,
  serpMarketNameSchema,
} from "./keyword";
import { serpDepthSchema } from "./serp-depth";

const idSchema = z.string().trim().min(1).max(120);
export const trackingScopeValues = ["country", "city"] as const;
export const trackingScopeSchema = z.enum(trackingScopeValues).default("country");
export type TrackingScope = z.infer<typeof trackingScopeSchema>;

export function normalizeTrackingScope(value: string | null | undefined): TrackingScope {
  return trackingScopeSchema.catch("country").parse(value);
}

export const projectInspectionBudgetSchema = z.object({
  inspectionDailyLimit: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_INSPECTION_DAILY_LIMIT)
    .default(DEFAULT_INSPECTION_DAILY_LIMIT),
  projectId: idSchema,
});

export const domainSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform((value) =>
    value
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase(),
  )
  .refine((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value), {
    message: "Enter a domain such as example.com.",
  });

// Historical only. Hosted instance-import workspaces used to be created with a
// generated host; nothing is served at that name and the user never typed it, so it
// is recognised solely to be treated as "no domain set".
const generatedWorkspaceDomainPattern = /^workspace-[0-9a-f]{4,32}\.bisibility\.cloud$/;

export function isGeneratedWorkspaceDomain(value: string | null | undefined) {
  return generatedWorkspaceDomainPattern.test((value ?? "").trim().toLowerCase());
}

/** The domain the product should track, or null when the workspace has none yet. */
export function trackedProjectDomain(value: string | null | undefined) {
  const domain = (value ?? "").trim();
  return domain.length > 0 && !isGeneratedWorkspaceDomain(domain) ? domain : null;
}

export const projectDefaultsSchema = keywordScheduleBaseSchema
  .extend({
    city: serpCitySchema,
    country: serpMarketNameSchema.default(DEFAULT_SERP_MARKET),
    device: deviceSchema.default(DEFAULT_SERP_DEVICE),
    locationKey: canonicalKeySchema.optional(),
    projectId: idSchema,
    serpDepth: serpDepthSchema.default(DEFAULT_SERP_DEPTH),
    serpStopOnMatch: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === "custom_cron" && !value.cronExpression) {
      ctx.addIssue({
        code: "custom",
        message: "Custom cron schedules require a cron expression.",
        path: ["cronExpression"],
      });
    }
  });

const projectScheduleSchema = keywordScheduleBaseSchema
  .extend({ serpDepth: serpDepthSchema.default(DEFAULT_SERP_DEPTH) })
  .superRefine((value, ctx) => {
    if (value.frequency === "custom_cron" && !value.cronExpression) {
      ctx.addIssue({
        code: "custom",
        message: "Custom cron schedules require a cron expression.",
        path: ["cronExpression"],
      });
    }
  });

// The domain is optional at creation: a workspace can exist before the user says
// what to track. It is enforced where the product cannot proceed without it - see
// lib/projects/tracked-domain.
export const optionalDomainSchema = z
  .union([z.string().trim().length(0), domainSchema])
  .nullish()
  .transform((value) => value || null);

export const createProjectSchema = z.object({
  defaults: projectScheduleSchema.optional(),
  domain: optionalDomainSchema,
  name: z.string().trim().min(1).max(120),
  trackingScope: trackingScopeSchema,
});

export const projectDefaultsPatchSchema = keywordScheduleBaseSchema
  .extend({
    city: serpCitySchema,
    country: serpMarketNameSchema.optional(),
    device: deviceSchema.optional(),
    locationKey: canonicalKeySchema.optional(),
    projectId: idSchema,
    serpDepth: serpDepthSchema.default(DEFAULT_SERP_DEPTH),
    serpStopOnMatch: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === "custom_cron" && !value.cronExpression) {
      ctx.addIssue({
        code: "custom",
        message: "Custom cron schedules require a cron expression.",
        path: ["cronExpression"],
      });
    }
    const hasLocationKey = value.locationKey !== undefined;
    const hasCountry = value.country !== undefined;
    const hasDevice = value.device !== undefined;
    if (!hasLocationKey && hasCountry !== hasDevice) {
      ctx.addIssue({
        code: "custom",
        message: "country and device must be provided together.",
        path: value.country === undefined ? ["country"] : ["device"],
      });
    }
  });

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type ProjectDefaultsInput = Omit<
  z.infer<typeof projectDefaultsSchema>,
  "serpDepth" | "serpStopOnMatch"
> & {
  serpDepth?: SerpDepth;
  serpStopOnMatch?: boolean;
};
export type ProjectDefaultsPatchInput = z.infer<typeof projectDefaultsPatchSchema>;
