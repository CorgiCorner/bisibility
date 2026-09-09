import { serpDeviceValues } from "@/lib/serp/constants";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const publicId = (prefix: string) => ({ pattern: `^${prefix}_[a-z][a-z0-9]{23}$`, type: "string" });
const text = { type: "string" };
const targetUrl = {
  description: "Absolute URL, path, null, or omitted.",
  maxLength: 500,
  type: ["string", "null"],
};
const importLocationLabel = {
  description:
    "Human-readable source location label. Version 7 identifies the location by location_key.",
  maxLength: 240,
  minLength: 1,
  type: "string",
};
const importLocationKey = {
  description: "Canonical source Location key. Required by version 7 exports.",
  type: "string",
};

export const cloudImportKeywordAlertTargetSchema = {
  additionalProperties: false,
  properties: {
    device: { enum: serpDeviceValues, type: "string" },
    keyword: { maxLength: 180, minLength: 1, type: "string" },
    keyword_id: publicId("kw"),
    location: importLocationLabel,
    location_key: importLocationKey,
    type: { const: "keyword", type: "string" },
  },
  required: ["keyword_id", "type"],
  type: "object",
};

export const cloudImportKeywordSchema = {
  additionalProperties: false,
  properties: {
    device: { enum: serpDeviceValues, type: "string" },
    id: publicId("kw"),
    keyword: { maxLength: 180, minLength: 1, type: "string" },
    location: importLocationLabel,
    location_key: importLocationKey,
    rankingHistory: {
      items: ref("CloudImportRankingHistory"),
      maxItems: 5000,
      type: "array",
    },
    tags: { items: { maxLength: 48, minLength: 1, type: "string" }, maxItems: 12, type: "array" },
    target_url: targetUrl,
  },
  required: ["id", "keyword", "device", "location"],
  type: "object",
};

export const cloudImportSourceKeywordSchema = {
  additionalProperties: false,
  properties: {
    device: { enum: serpDeviceValues, type: "string" },
    location: importLocationLabel,
    location_key: importLocationKey,
    text,
  },
  required: ["device", "location", "text"],
  type: "object",
};
