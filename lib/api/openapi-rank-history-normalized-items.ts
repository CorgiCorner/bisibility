import { publicIdSchema } from "./openapi-public-id";

const text = { type: "string" } as const;
const date = { type: "string", format: "date-time" } as const;
const integer = { type: "integer", minimum: 0 } as const;
const nullable = (value: object) => ({ anyOf: [value, { type: "null" }] });
const properties = {
  id: text,
  check_id: publicIdSchema("check"),
  keyword_id: publicIdSchema("kw"),
  checked_at: date,
  check_recorded_at: date,
  observed_at: nullable(date),
  recorded_at: date,
  requested_at: nullable(date),
  source_observed_at: nullable(date),
  block_position: nullable(integer),
  business_name: nullable(text),
  cid: nullable(text),
  domain: nullable(text),
  maps_url: nullable(text),
  ordinal: integer,
  place_id: nullable(text),
  position_in_block: nullable(integer),
  rank_absolute: nullable(integer),
  rank_group: nullable(integer),
  rank_scale: nullable(text),
  promotion: nullable(text),
  source_page: nullable(integer),
  source_block_id: nullable(text),
  source_ordinal: nullable(integer),
  result_kind: text,
  title: nullable(text),
  url: nullable(text),
};
/** Explicit normalized allowlist: raw fragments and current identity matches are never exposed. */
export const rankHistoryNormalizedItemSchema = {
  type: "object",
  properties,
  required: Object.keys(properties),
};
