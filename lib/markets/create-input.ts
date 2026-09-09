import { CANONICAL_KEY_MAX } from "@/lib/api/locations-search-contract";
import { z } from "zod";

const KEYWORD_TEXT_MAX = 180;

/** The kinds a tracked Location can have; identical to the Prisma `LocationKind` enum. */
export const marketLocationKinds = ["country", "region", "city"] as const;
export type MarketLocationKind = (typeof marketLocationKinds)[number];
const publicIdSuffix = /^[a-z][a-z0-9]{23}$/;

function hasPublicIdPrefix(value: string, prefix: string) {
  const [receivedPrefix, suffix, ...extra] = value.split("_");
  return extra.length === 0 && receivedPrefix === prefix && publicIdSuffix.test(suffix ?? "");
}

function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const projectIdSchema = z
  .string()
  .refine((value) => hasPublicIdPrefix(value, "prj"), "Project not found.");
const marketIdSchema = z
  .string()
  .refine((value) => hasPublicIdPrefix(value, "pmkt"), "Source market is invalid.");
const scheduleIdSchema = z
  .string()
  .refine((value) => hasPublicIdPrefix(value, "sch"), "Schedule is invalid.");

const scheduleInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z.object({ kind: z.literal("existing"), scheduleId: scheduleIdSchema }).strict(),
  z
    .object({
      frequency: z.enum(["daily", "weekly", "monthly"]),
      kind: z.literal("inline"),
      name: z.string().trim().max(80).optional(),
      timeOfDay: z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
    })
    .strict(),
]);

const methodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }).strict(),
  z.object({ kind: z.literal("copy"), sourceMarketId: marketIdSchema }).strict(),
  z.object({ kind: z.literal("paste"), text: z.string().max(20_000) }).strict(),
]);

/**
 * A market is created against a canonical location KEY, the same key the location search hands
 * out, never against a database id: the server resolves the key itself and creates the Location
 * row when the provider-backed search offered one that does not exist yet. `kind`, `countryCode`
 * and `languageCode` travel with the key so the server can refuse a key that resolves to
 * something other than what the form showed.
 */
export const newMarketCreateSchema = z
  .object({
    canonicalKey: z.string().trim().min(1).max(CANONICAL_KEY_MAX),
    countryCode: z.string().trim().length(2),
    devices: z
      .array(z.enum(["desktop", "mobile"]))
      .min(1)
      .max(2)
      .refine((items) => new Set(items).size === items.length),
    kind: z.enum(marketLocationKinds),
    languageCode: z.string().trim().min(2).max(35),
    method: methodSchema,
    name: z.string().trim().max(120, "Market names are 120 characters or fewer.").optional(),
    projectId: projectIdSchema,
    schedule: scheduleInputSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.method.kind !== "empty" && !value.schedule) {
      context.addIssue({
        code: "custom",
        message: "Choose Manual or a schedule.",
        path: ["schedule"],
      });
    }
    if (value.method.kind === "empty" && value.schedule) {
      context.addIssue({
        code: "custom",
        message: "Empty markets do not have a schedule.",
        path: ["schedule"],
      });
    }
  });

export type NewMarketCreateInput = z.infer<typeof newMarketCreateSchema>;
export type MarketPasteRow = { targetUrl: string | null; text: string };

/**
 * What a created market hands back. `publicId` is the market's stable pmkt_ identity; the rest is
 * the identity of the Location it was created against, because both add-keywords hosts select and
 * submit a market by its canonical key, never by the public id.
 */
export type NewMarketCreateResult = {
  canonicalKey: string;
  countryCode: string;
  displayName: string;
  keywordCount: number;
  kind: MarketLocationKind;
  languageCode: string;
  languageLabel: string;
  publicId: string;
};

export class MarketPasteValidationError extends Error {
  readonly code = "market_paste_invalid";

  constructor(message: string) {
    super(message);
    this.name = "MarketPasteValidationError";
  }
}

function validTargetUrl(value: string) {
  return value.startsWith("/") ? !value.startsWith("//") : URL.canParse(value);
}

export function parseNewMarketPaste(value: string): MarketPasteRow[] {
  const rows: MarketPasteRow[] = [];
  const seen = new Set<string>();
  for (const [index, rawLine] of value.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const pipe = line.indexOf("|");
    const text = (pipe === -1 ? line : line.slice(0, pipe)).trim();
    const targetUrl = pipe === -1 ? "" : line.slice(pipe + 1).trim();
    if (!text)
      throw new MarketPasteValidationError(`Line ${index + 1}: add a keyword before the URL.`);
    if (text.length > KEYWORD_TEXT_MAX) {
      throw new MarketPasteValidationError(`Line ${index + 1}: a keyword is too long.`);
    }
    if (targetUrl && !validTargetUrl(targetUrl)) {
      throw new MarketPasteValidationError(`Line ${index + 1}: URL or path is invalid.`);
    }
    const normalized = normalizeKeyword(text);
    if (seen.has(normalized)) {
      throw new MarketPasteValidationError(
        `Line ${index + 1}: duplicate keyword after normalization.`,
      );
    }
    seen.add(normalized);
    rows.push({ targetUrl: targetUrl || null, text });
  }
  if (rows.length === 0) throw new MarketPasteValidationError("Paste at least one keyword.");
  return rows;
}
