import { CHALLENGE_TILE_IDS } from "@/lib/challenge-report/tile-state";
import { SHARE_EXPIRY_CHOICES } from "@/lib/report-sharing/settings";
import { z } from "zod";

const target = {
  projectId: z.string().trim().min(1),
  reportId: z.string().trim().min(1),
};

export const reportShareTargetSchema = z.object(target).strict();

export const reportShareSettingsSchema = z
  .object({
    ...target,
    noindex: z.boolean().optional(),
    roundNumbers: z.boolean().optional(),
    showBadge: z.boolean().optional(),
    showLessons: z.boolean().optional(),
    visibleTiles: z.array(z.enum(CHALLENGE_TILE_IDS)).optional(),
  })
  .strict();

export const reportShareExpirySchema = z
  .object({ ...target, expires: z.enum(SHARE_EXPIRY_CHOICES) })
  .strict();

export const reportSharePublishSchema = z
  .object({ ...target, mode: z.enum(["link", "new"]) })
  .strict();

export const reportShareCreateSchema = reportShareSettingsSchema.extend({
  expires: z.enum(SHARE_EXPIRY_CHOICES).optional(),
});
