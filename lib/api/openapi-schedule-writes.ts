import { scheduleReviewSchema } from "@/lib/schemas/schedule-review";
import { z } from "zod";
import { problemResponse } from "./openapi-problem";
import { openEnum, sdkName, taggedUnion, usdCents } from "./openapi-sdk-schema";
import {
  publicSchedulePreviewBody,
  scheduleCreateBody,
  scheduleUpdateBody,
} from "./schedule-write-input";

function inputSchema(schema: z.ZodType) {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema, {
    io: "input",
    target: "draft-2020-12",
  });
  return body;
}

export const publicScheduleReviewSchema = {
  ...inputSchema(scheduleReviewSchema),
  ...sdkName("ScheduleReviewSubmission"),
};

const create = inputSchema(scheduleCreateBody);
const update = inputSchema(scheduleUpdateBody);
const preview = inputSchema(publicSchedulePreviewBody);

export const scheduleWriteSchemas = {
  CreateScheduleRequest: {
    ...create,
    ...taggedUnion("kind", ["rank", "ai"]),
  },
  UpdateScheduleRequest: {
    ...update,
    ...taggedUnion("kind", ["state", "rank", "ai"]),
  },
  PreviewScheduleRequest: {
    ...preview,
    ...taggedUnion("operation", [
      "create",
      "update",
      "setSchedule",
      "setFrequency",
      "createKeywords",
    ]),
  },
  ScheduleChangePreview: {
    type: "object",
    properties: {
      cost_before_cents: { type: ["number", "null"], ...usdCents },
      cost_after_cents: { type: ["number", "null"], ...usdCents },
      requires_review: { type: "boolean" },
      review_reasons: {
        type: "array",
        items: {
          type: "string",
          enum: ["cost_increase", "manual_to_scheduled", "provider_route_change", "price_unknown"],
          ...openEnum("ScheduleReviewReason"),
        },
      },
      capacity: {
        type: ["object", "null"],
        ...sdkName("SchedulePreviewCapacity"),
        properties: {
          exceeded: { type: "boolean" },
          dimensions: { type: "object", additionalProperties: true },
        },
        required: ["exceeded", "dimensions"],
      },
      expected_revision: { type: "string" },
      preview_token: { type: ["string", "null"] },
      window_start: { type: "string", format: "date-time" },
    },
    required: [
      "cost_before_cents",
      "cost_after_cents",
      "requires_review",
      "review_reasons",
      "capacity",
      "expected_revision",
      "preview_token",
      "window_start",
    ],
  },
};

export const scheduleReviewProblems = {
  "409": problemResponse("The schedule changed or its review token expired or was used."),
  "428": problemResponse("Recurring spend increase requires review", {
    $ref: "#/components/schemas/ScheduleReviewRequiredProblem",
  }),
};
