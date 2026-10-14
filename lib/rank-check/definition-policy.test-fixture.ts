import type { Prisma } from "@/lib/generated/prisma/client";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import { hostDefinitionAdapters } from "@/lib/measurement-definitions/host-adapters";
import type { HostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-contract";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";

export function configuredDefinitionPolicyFixture(): HostPolicySnapshot {
  return {
    state: "ready",
    policyEpoch: "1",
    config: {
      version: 1,
      definitionVersion: "web-organic-v1",
      forcedAiOverview: false,
      adapters: hostDefinitionAdapters(),
      freshness: {
        configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
        manualTtlMs: null,
        cadenceGraceMs: null,
      },
    },
  };
}

export function definitionKeywordScopeFixture(locationId = "location_active") {
  return {
    device: "desktop" as const,
    locationRef: {
      id: locationId,
      kind: "country" as const,
      displayName: "United States",
      canonicalKey: "country:us",
      countryCode: "US",
      languageCode: "en",
      languageLabel: "English",
      cityName: null,
      regionCode: null,
      gl: "us",
      hl: "en",
      primaryGeoCode: 2840,
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  };
}

export function admittedDefinitionSourceFixture(projectId: string, keywordId: string) {
  const source = definitionSourceFixture();
  source.projectId = projectId;
  source.keywordId = keywordId;
  source.policy.config = configuredDefinitionPolicyFixture().config!;
  source.target.locationId = "location_active";
  const { languageLabel: _label, ...location } = definitionKeywordScopeFixture().locationRef;
  source.target.location = location;
  return source;
}

/** Installed catalog/source rows for these unit fixtures; unmatched SQL stays with the suite's adapter. */
export function definitionQueryFixture(
  fallback: (
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => unknown = async () => [],
) {
  return async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = (Array.isArray(query) ? query : (query as Prisma.Sql).strings).join("?");
    const parameters = Array.isArray(query) ? values : (query as Prisma.Sql).values;
    if (sql.includes("measurement_target_revisions") && sql.includes("AS tables"))
      return [{ tables: 4, source: true, guard: true }];
    if (sql.includes("measurement_definition_authority_intact() AS intact"))
      return [{ intact: true }];
    if (sql.includes('"measurementPolicyConfig" AS config'))
      return [{ epoch: "1", config: configuredDefinitionPolicyFixture().config }];
    if (sql.includes("SELECT measurement_definition_source("))
      return [
        { source: admittedDefinitionSourceFixture(String(parameters[0]), String(parameters[1])) },
      ];
    if (sql.includes("SELECT id FROM keywords") && sql.includes("FOR SHARE"))
      return [{ id: parameters[0] }];
    return fallback(query, ...values);
  };
}
