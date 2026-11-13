import { CHALLENGE_TILE_IDS, type ChallengeTileId } from "@/lib/challenge-report/tile-state";
import { z } from "zod";

export const DEFAULT_VISIBLE_TILES = [
  "clicks",
  "top10",
  "aiAnswers",
  "cost",
  "conversions",
  "topPages",
] as const satisfies readonly ChallengeTileId[];

export const SHARE_EXPIRY_CHOICES = ["never", "7", "30", "90"] as const;
export type ShareExpiryChoice = (typeof SHARE_EXPIRY_CHOICES)[number];

const tileId = z.enum(CHALLENGE_TILE_IDS);

export const shareSettingsSchema = z
  .object({
    noindex: z.boolean().default(true),
    roundNumbers: z.boolean().default(false),
    showBadge: z.boolean().default(true),
    showLessons: z.boolean().default(true),
    version: z.literal(1).default(1),
    visibleTiles: z.array(tileId).default(() => [...DEFAULT_VISIBLE_TILES]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.visibleTiles).size !== value.visibleTiles.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate tile." });
    }
  });

export type ShareSettings = z.infer<typeof shareSettingsSchema>;

export function defaultShareSettings(): ShareSettings {
  const parsed = shareSettingsSchema.parse({});
  return { ...parsed, visibleTiles: orderedVisibleTiles(parsed.visibleTiles) };
}

export function orderedVisibleTiles(tiles: readonly ChallengeTileId[]): ChallengeTileId[] {
  const selected = new Set(tiles);
  return CHALLENGE_TILE_IDS.filter((id) => selected.has(id));
}

export function parseShareSettings(value: unknown): ShareSettings {
  const parsed = shareSettingsSchema.safeParse(value);
  if (!parsed.success) return defaultShareSettings();
  return { ...parsed.data, visibleTiles: orderedVisibleTiles(parsed.data.visibleTiles) };
}

const DAY_MS = 86_400_000;

export function expiryChoice(createdAt: Date, expiresAt: Date | null): ShareExpiryChoice {
  if (!expiresAt) return "never";
  const days = Math.round((expiresAt.getTime() - createdAt.getTime()) / DAY_MS);
  if (days <= 14) return "7";
  if (days <= 45) return "30";
  return "90";
}

export function expiryDate(choice: ShareExpiryChoice, now: Date): Date | null {
  if (choice === "never") return null;
  return new Date(now.getTime() + Number(choice) * DAY_MS);
}
