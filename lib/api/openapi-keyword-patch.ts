import { serpDeviceValues } from "@/lib/serp/constants";
import {
  deprecatedLegacyMarketField,
  legacyMarketNameOpenApiSchema,
  primaryLocationKeyDescription,
} from "./legacy-market-input";
import { scheduleInputContractSchema } from "./openapi-schedule-schema";

const marketIdentityDescription =
  "Keyword identity field. A value that resolves to a market different from the stored market is rejected with 409; a value that resolves to the same market is accepted.";
const termIdentityDescription =
  "Keyword identity field. A value different from the stored term is rejected with 409; the same value is accepted.";
const deviceIdentityDescription =
  "Keyword identity field. A value different from the stored device is rejected with 409; the same value is accepted.";

export const keywordPatchSchema = {
  properties: {
    city: deprecatedLegacyMarketField(marketIdentityDescription, { type: ["string", "null"] }),
    country: legacyMarketNameOpenApiSchema(marketIdentityDescription),
    device: {
      description: deviceIdentityDescription,
      enum: serpDeviceValues,
      type: "string",
    },
    frequency: {
      enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
      type: "string",
    },
    intent: { type: ["string", "null"] },
    keyword: {
      description: termIdentityDescription,
      example: "rank tracker docs",
      type: "string",
    },
    location: legacyMarketNameOpenApiSchema(
      `Backward-compatible alias for country. ${marketIdentityDescription}`,
    ),
    location_key: {
      description: primaryLocationKeyDescription(
        `The default language normalizes to the unqualified key. ${marketIdentityDescription}`,
      ),
      example: "ES/Andalusia/Malaga@en",
      type: "string",
    },
    schedule: scheduleInputContractSchema,
    tags: { items: { type: "string" }, type: "array" },
    target_url: { type: ["string", "null"] },
    topic: { type: ["string", "null"] },
  },
  required: [],
  type: "object",
};
