import { definitionFingerprint, frozenRequest } from "./canonical";
import type { DefinitionBinding, DefinitionHead, DefinitionSource } from "./model";
import { definitionSourceSchema } from "./schema";

/** Synthetic source contract only. No actual credential, task, user, address or provider payload. */
export function definitionSourceFixture(): DefinitionSource {
  return definitionSourceSchema.parse({
    projectId: "synthetic-project",
    projectPublicId: "prj_synthetic",
    keywordId: "synthetic-keyword",
    keywordPublicId: "kw_synthetic",
    epochs: {
      projectTarget: "0",
      projectPolicy: "1",
      keywordTarget: "0",
      keywordPolicy: "0",
      location: "0",
      checkSchedule: null,
    },
    target: {
      domain: "example.test",
      text: "synthetic query",
      targetUrl: "https://example.test/a",
      device: "desktop",
      locationId: "synthetic-location",
      keywordLocation: "Synthetic",
      archivedAt: null,
      location: {
        id: "synthetic-location",
        kind: "city",
        displayName: "Synthetic",
        countryCode: "PL",
        regionCode: null,
        cityName: "Synthetic",
        canonicalKey: "synthetic-location-key",
        gl: "pl",
        hl: "en",
        languageCode: "en",
        primaryGeoCode: null,
        primaryGeoName: "Synthetic",
        secondaryGeoName: "Synthetic",
      },
    },
    policy: {
      config: {
        version: 1,
        definitionVersion: "web-organic-v1",
        forcedAiOverview: false,
        adapters: [
          {
            providerId: "synthetic",
            capabilityVersion: "synthetic-cap-v1",
            adapterVersion: "synthetic-adapter-v1",
            nativeFindTargetsIn: "none",
          },
        ],
        freshness: {
          configurationRevision: "synthetic-fresh-v1",
          manualTtlMs: 12345,
          cadenceGraceMs: 321,
        },
      },
      defaults: {
        frequency: "manual",
        cronExpression: null,
        timezone: "UTC",
        jitterMinutes: 0,
        serpDepth: 100,
        device: null,
        locationKey: null,
        country: null,
        city: null,
        serpStopOnMatch: true,
      },
      keywordSchedule: null,
      checkSchedule: null,
    },
  });
}
export function definitionHeadFixture(source = definitionSourceFixture()): DefinitionHead {
  return {
    targetRevision: "synthetic-target-revision-a",
    policyRevision: "synthetic-policy-revision-a",
    generation: "1",
    sourceFingerprint: definitionFingerprint(source),
    targetSource: structuredClone(source.target),
    policySource: structuredClone(source.policy),
    epochs: structuredClone(source.epochs),
    capturedAt: new Date("2026-10-01T00:00:00.000Z"),
  };
}
export function definitionBindingFixture(source = definitionSourceFixture()): DefinitionBinding {
  const head = definitionHeadFixture(source);
  return {
    id: "synthetic-binding-a",
    projectId: source.projectId,
    keywordId: source.keywordId,
    targetRevision: head.targetRevision,
    policyRevision: head.policyRevision,
    owner: {
      rankCheckId: "synthetic-check",
      executionKey: "synthetic-execution",
      queuedTaskId: null,
    },
    request: frozenRequest(source, "synthetic"),
    source,
    capturedAt: head.capturedAt,
  };
}

export function assignedDefinitionSourceFixture(): DefinitionSource {
  const source = definitionSourceFixture();
  source.epochs.checkSchedule = "0";
  source.policy.checkSchedule = {
    id: "synthetic-schedule",
    publicId: "sch_synthetic",
    projectId: source.projectId,
    frequency: "daily",
    cronExpression: null,
    timezone: "UTC",
    jitterMinutes: 0,
    serpDepth: 20,
    enabled: true,
    archivedAt: null,
    providerPolicy: null,
    timeOfDay: "06:00",
    isDefault: false,
  };
  return definitionSourceSchema.parse(source);
}
