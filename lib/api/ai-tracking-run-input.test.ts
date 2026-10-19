import { expect, it } from "vitest";
import {
  parseTrackingRunApiPlan,
  trackingPreviewSchema,
  trackingRunApiPlanSchema,
} from "./ai-tracking-run-input";

const configuration = {
  provider: "dataforseo",
  endpoint: "example",
  engine: "chat_gpt",
  source: "model_api",
  model: null,
  parameters: {},
};
const preview = { promptIds: ["aip_a00000000000000000000000"], configurations: [configuration] };

it("keeps empty optional connection IDs equivalent to choosing the default connection", () => {
  expect(trackingPreviewSchema.parse({ ...preview, credentialConnectionId: "" })).toEqual(preview);
  expect(trackingPreviewSchema.parse(preview)).toEqual(preview);
  expect(
    trackingPreviewSchema.safeParse({ ...preview, credentialConnectionId: "internal" }).success,
  ).toBe(false);
  expect(trackingPreviewSchema.safeParse({ ...preview, promptIds: ["internal"] }).success).toBe(
    false,
  );
});

it("validates public plan IDs while retaining paired schedule occurrence validation", () => {
  const plan = {
    ...preview,
    actorId: "actor",
    idempotencyKey: "key",
    credentialConnectionId: "conn_a00000000000000000000000",
    credentialVersion: "v1",
    budgetRevision: "b1",
    consentRevision: "c1",
    origin: "manual",
    entrySource: "api",
    deadline: "2026-10-18T12:00:00Z",
  };
  expect(trackingRunApiPlanSchema.safeParse(plan).success).toBe(true);
  expect(parseTrackingRunApiPlan({ ...plan, scheduleId: "" }).scheduleId).toBeUndefined();
  expect(
    trackingRunApiPlanSchema.safeParse({ ...plan, credentialConnectionId: "internal" }).success,
  ).toBe(false);
  expect(
    trackingRunApiPlanSchema.safeParse({ ...plan, scheduleId: "ais_a00000000000000000000000" })
      .success,
  ).toBe(false);
  expect(
    trackingRunApiPlanSchema.safeParse({
      ...plan,
      scheduleId: "ais_a00000000000000000000000",
      plannedAt: "2026-10-18T12:00:00Z",
    }).success,
  ).toBe(true);
});
