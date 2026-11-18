import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  plan: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiTrackingSchedule: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    aiPrompt: { findMany: vi.fn() },
    aiTrackingRun: { findUnique: vi.fn().mockResolvedValue(null), upsert: mocks.upsert },
  },
}));
vi.mock("@/lib/ai-tracking/admission/actor", () => ({ reauthorizeTrackingActor: vi.fn() }));
vi.mock("@/lib/ai-tracking/admission/context", () => ({
  trackingAdmissionContext: vi.fn().mockResolvedValue({
    connection: { id: "connection", publicId: "connection-public" },
    credentialVersion: "version",
    budgetRevision: "budget",
  }),
}));
vi.mock("@/lib/ai-tracking/admission/pricing", () => ({
  TRACKING_PRICE_CHECKED_AT: "price-version",
  trackingModelForecast: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/ai-tracking/providers/capabilities", () => ({
  TRACKING_CAPABILITY_VERSION: "capability-version",
  validateTrackingRequest: vi.fn(),
}));
vi.mock("@/lib/ai-tracking/payment", () => ({
  assertTrackingPayment: vi.fn(),
  trackingPaymentDefinition: vi.fn(),
  trackingPaymentQuote: vi.fn().mockReturnValue({ payment: {}, paymentOptions: [] }),
}));
vi.mock("@/lib/ai-tracking/stores/runs", () => ({ planTrackingRun: mocks.plan }));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("@/lib/db/public-id-resources", () => ({ makePublicId: () => "air_run" }));

import { TrackingConsentStaleError } from "@/lib/ai-tracking/admission/errors";
import {
  approveTrackingConfiguration,
  trackingConsentRevision,
} from "@/lib/ai-tracking/admission/launch";
import { prisma } from "@/lib/db/prisma";
import { planDueTrackingSchedules } from "./sweep";

it("characterizes admission after one of two frozen prompts is archived", async () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const configurations = [{ engine: "chatgpt" }] as never;
  const revisions = [
    { id: "revision-one", textHash: "hash-one" },
    { id: "revision-two", textHash: "hash-two" },
  ];
  vi.mocked(prisma.aiTrackingSchedule.findMany).mockResolvedValueOnce([
    {
      id: "schedule",
      projectId: "project",
      cron: "0 12 * * *",
      timezone: "UTC",
      nextRunAt: now,
      configuration: {
        actorId: "actor",
        budgetRevision: "budget",
        configurations,
        consentRevision: trackingConsentRevision(configurations, "version", revisions),
        credentialConnectionId: "connection",
        credentialVersion: "version",
        promptIds: ["prompt-one", "prompt-two"],
      },
    },
  ] as never);
  vi.mocked(prisma.aiPrompt.findMany)
    .mockResolvedValueOnce([
      { id: "prompt-one", revisions: [{ ...revisions[0], text: "prompt" }] },
    ] as never)
    .mockResolvedValueOnce([{ id: "prompt-one" }] as never)
    .mockResolvedValueOnce([
      { id: "prompt-one", revisions: [{ ...revisions[0], text: "prompt" }] },
    ] as never);

  await expect(
    approveTrackingConfiguration("project", {
      actorId: "actor",
      budgetRevision: "budget",
      configurations,
      consentRevision: trackingConsentRevision(configurations, "version", revisions),
      credentialConnectionId: "connection",
      credentialVersion: "version",
      promptIds: ["prompt-one"],
      origin: "scheduled",
      entrySource: "worker",
      idempotencyKey: "occurrence",
      deadline: now.toISOString(),
      consent: true,
    }),
  ).rejects.toBeInstanceOf(TrackingConsentStaleError);
  expect(await planDueTrackingSchedules(now)).toEqual({ planned: 0, skipped: 0 });
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: {},
      create: expect.objectContaining({ reasonCode: "consent_stale", state: "blocked" }),
    }),
  );
});
