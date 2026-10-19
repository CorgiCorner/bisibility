import { z } from "zod";
import { ApiInputError } from "./errors";
import { pageQuery } from "./pagination";

export const keywordSortValues = [
  "created_at",
  "-created_at",
  "keyword",
  "-keyword",
  "text",
  "-text",
  "updated_at",
  "-updated_at",
] as const;

const metadataFilter = z.string().trim().min(1).max(80);

/** The listKeywords query under its canonical wire names. */
export const keywordListQuerySchema = z.object({
  country: z.string().optional(),
  cursor: pageQuery.shape.cursor,
  device: z.enum(["desktop", "mobile"]).optional(),
  intent: metadataFilter.optional(),
  limit: pageQuery.shape.limit,
  location_key: z.string().optional(),
  position_gt: z.coerce.number().optional(),
  position_lt: z.coerce.number().optional(),
  search: z.string().optional(),
  sort: z.enum(keywordSortValues).optional(),
  tag: z.string().optional(),
  topic: metadataFilter.optional(),
});

export type KeywordListQuery = z.infer<typeof keywordListQuerySchema>;
type CanonicalName = keyof KeywordListQuery;

/** Wire aliases of canonical names. Each alias is also an OpenAPI query parameter. */
export const keywordListQueryAliases = {
  "filter[country]": "country",
  "filter[device]": "device",
  "filter[intent]": "intent",
  "filter[location_key]": "location_key",
  "filter[position_gt]": "position_gt",
  "filter[position_lt]": "position_lt",
  "filter[tag]": "tag",
  "filter[topic]": "topic",
  q: "search",
} as const satisfies Record<string, CanonicalName>;

/** The first non-empty name wins: a filter[...] alias over its plain name, search over q. */
function wireNames(name: CanonicalName) {
  const aliases = Object.entries(keywordListQueryAliases)
    .filter(([, canonical]) => canonical === name)
    .map(([alias]) => alias);
  return name === "search" ? [name, ...aliases] : [...aliases, name];
}

function legacyMessage(name: PropertyKey | undefined) {
  if (name === "device") return "device must be desktop or mobile.";
  if (name === "intent" || name === "topic") {
    return `${name} must be a non-empty string up to 80 characters.`;
  }
  if (name === "position_gt" || name === "position_lt") {
    return `filter[${name}] must be a number.`;
  }
  return null;
}

/** Reads the listKeywords query. Filter errors keep their established messages. */
export function parseKeywordListQuery(url: URL): KeywordListQuery {
  const input: Record<string, string> = {};
  for (const name of keywordListQuerySchema.keyof().options) {
    const value = wireNames(name)
      .map((wire) => url.searchParams.get(wire))
      .find(Boolean);
    if (value) input[name] = value;
  }
  const parsed = keywordListQuerySchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const paging = parsed.error.issues.some((issue) =>
    ["limit", "sort"].includes(String(issue.path[0])),
  );
  const message = paging ? null : legacyMessage(parsed.error.issues[0]?.path[0]);
  if (message) throw new ApiInputError(message);
  throw parsed.error;
}
