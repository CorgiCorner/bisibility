import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/ai-tracking/identity";
import { scheduleInputSchema } from "@/lib/ai-tracking/schema";
import { trackingCamelizeKeys } from "./ai-tracking-keys";
import { type ApiContext, requireApiActor } from "./context";
import { providerOrigin } from "./request-origin";

export function apiAiScheduleInput(ctx: ApiContext, input: object, update: boolean) {
  const value = trackingCamelizeKeys(input) as {
    configuration?: object;
    consent?: boolean;
    review?: unknown;
    kind?: string;
  };
  const { review: _review, kind: _kind, ...fields } = value;
  const actorId = requireApiActor(ctx).id;
  const schema = update ? scheduleInputSchema.partial() : scheduleInputSchema;
  const parsed = schema.parse({
    ...fields,
    ...(value.configuration
      ? {
          configuration: {
            ...value.configuration,
            idempotencyKey: `schedule-template-${createHash("sha256")
              .update(canonicalJson([actorId, fields]))
              .digest("hex")}`,
            actorId,
            actorCredential: providerOrigin(ctx.origin).credential,
            entrySource: ctx.origin.source,
            origin: "manual",
          },
        }
      : {}),
  });
  return { ...parsed, ...(value.consent === true ? { consent: true } : {}) };
}
