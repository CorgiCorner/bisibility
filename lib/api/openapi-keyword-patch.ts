import { serpDeviceValues } from "@/lib/serp/constants";
import { z } from "zod";
import {
  deprecatedLegacyMarketField,
  legacyMarketNameOpenApiSchema,
  primaryLocationKeyDescription,
} from "./legacy-market-input";
import { keywordBulkRequest } from "./openapi-keyword-bulk";
import { closedEnum, sdkName } from "./openapi-sdk-schema";
import { keywordPatchSchema as patchValidator } from "./schemas";

const marketIdentityDescription =
  "Keyword identity field. A value that resolves to a market different from the stored market is rejected with 409; a value that resolves to the same market is accepted.";
const termIdentityDescription =
  "Keyword identity field. A value different from the stored term is rejected with 409; the same value is accepted.";
const deviceIdentityDescription =
  "Keyword identity field. A value different from the stored device is rejected with 409; the same value is accepted.";

const wire = z.toJSONSchema(patchValidator, { io: "input" }).properties as Record<
  string,
  Record<string, unknown>
>;
function fields(name: string, extra: object) {
  return { ...wire[name], ...extra };
}

export const keywordPatchSchema = {
  properties: {
    ...wire,
    city: fields(
      "city",
      deprecatedLegacyMarketField(marketIdentityDescription, { type: ["string", "null"] }),
    ),
    country: fields("country", {
      ...legacyMarketNameOpenApiSchema(marketIdentityDescription),
      ...closedEnum("KeywordPatchCountry"),
    }),
    device: {
      description: deviceIdentityDescription,
      enum: serpDeviceValues,
      ...closedEnum("KeywordPatchDevice"),
      type: "string",
    },
    frequency: {
      deprecated: true,
      ...closedEnum("KeywordPatchFrequency"),
      enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
      type: "string",
    },

    keyword: {
      ...wire.keyword,
      description: termIdentityDescription,
      example: "rank tracker docs",
      type: "string",
    },
    location: fields("location", {
      ...legacyMarketNameOpenApiSchema(
        `Backward-compatible alias for country. ${marketIdentityDescription}`,
      ),
      ...closedEnum("KeywordPatchLocation"),
    }),
    location_key: {
      ...wire.location_key,
      description: primaryLocationKeyDescription(
        `The default language normalizes to the unqualified key. ${marketIdentityDescription}`,
      ),
      example: "ES/Andalusia/Malaga@en",
      type: "string",
    },
    review: keywordBulkRequest.properties.review,
    schedule_id: keywordBulkRequest.properties.schedule_id,
    schedule: { ...keywordBulkRequest.properties.schedule, ...sdkName("KeywordPatchSchedule") },
  },
  required: [],
  type: "object",
};
