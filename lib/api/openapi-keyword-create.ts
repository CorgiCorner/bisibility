import { z } from "zod";
import { keywordBulkRequest } from "./openapi-keyword-bulk";
import { closedEnum, sdkName, shorthandUnion } from "./openapi-sdk-schema";
import { keywordCreateItemSchema } from "./schemas";

const { $schema: _dialect, ...item } = z.toJSONSchema(keywordCreateItemSchema, { io: "input" });
const properties = item.properties as Record<string, Record<string, unknown>>;
const keyword = {
  ...item,
  ...sdkName("KeywordAddItem"),
  properties: {
    ...properties,
    country: { ...properties.country, ...closedEnum("KeywordCreateCountry") },
    device: { ...properties.device, ...closedEnum("KeywordCreateDevice") },
    frequency: {
      ...properties.frequency,
      ...closedEnum("KeywordCreateFrequency"),
      description:
        "Explicitly join a matching project schedule. Omit frequency and schedule for Manual; schedule takes precedence.",
    },
    location: { ...properties.location, ...closedEnum("KeywordCreateLocation") },
    schedule: {
      ...keywordBulkRequest.properties.schedule,
      ...sdkName("KeywordCreateSchedule"),
    },
  },
};
const keywords = {
  type: "array",
  minItems: 1,
  maxItems: 500,
  items: {
    anyOf: [keyword, properties.keyword],
    ...sdkName("KeywordCreateInputItem"),
    ...shorthandUnion("KeywordAddItem"),
  },
};

export const keywordCreateRequest = {
  anyOf: [
    {
      type: "object",
      properties: { keywords },
      required: ["keywords"],
      ...sdkName("KeywordCreateRequest"),
    },
    { type: "array", minItems: 1, maxItems: 500, items: keyword },
    keyword,
  ],
  ...sdkName("KeywordCreateBody"),
  ...shorthandUnion("KeywordCreateRequest"),
};
