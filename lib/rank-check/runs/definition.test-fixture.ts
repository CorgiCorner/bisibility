import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import { hostDefinitionAdapters } from "@/lib/measurement-definitions/host-adapters";
import type {
  DefinitionSource,
  PersistedDefinitionPolicy,
} from "@/lib/measurement-definitions/model";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";

/** Synthetic database replies for the real definition parsers, without replacing admission guards. */
export function definitionPolicyFixture(): PersistedDefinitionPolicy {
  return {
    version: 1,
    definitionVersion: "web-organic-v1",
    forcedAiOverview: false,
    adapters: hostDefinitionAdapters(),
    freshness: {
      configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
      manualTtlMs: null,
      cadenceGraceMs: null,
    },
  };
}

export function admittedDefinitionSource(
  projectId: string,
  keywordId: string,
  text = keywordId,
): DefinitionSource {
  const source = definitionSourceFixture();
  source.projectId = projectId;
  source.projectPublicId = "prj_abcdefghijklmnopqrstuvwx";
  source.keywordId = keywordId;
  source.keywordPublicId = "kw_abcdefghijklmnopqrstuvwx";
  source.target.domain = "example.com";
  source.target.targetUrl = "https://example.com/a";
  source.target.text = text;
  source.target.locationId = "location_active";
  source.target.location.id = "location_active";
  source.policy.config = definitionPolicyFixture();
  return source;
}

/** Return only known authority queries; callers retain their own transaction and lock behavior. */
export function definitionQueryFixture(
  query: TemplateStringsArray | { strings: readonly string[]; values: readonly unknown[] },
  parameters: readonly unknown[] = [],
  sourceForKeyword = admittedDefinitionSource,
) {
  const strings = "strings" in query ? query.strings : query;
  const values = "strings" in query ? query.values : parameters;
  const sql = strings.join("?");
  if (sql.includes("to_regclass")) return [{ tables: 4, source: true, guard: true }];
  if (sql.includes("SELECT measurement_definition_authority_intact()")) return [{ intact: true }];
  if (sql.includes('"measurementPolicyConfig" AS config'))
    return [{ epoch: "1", config: definitionPolicyFixture() }];
  if (sql.includes("SELECT measurement_definition_source("))
    return [{ source: sourceForKeyword(String(values[0]), String(values[1])) }];
  if (sql.startsWith("SELECT id FROM projects WHERE id=")) return [{ id: values[0] }];
  if (sql.startsWith("SELECT id FROM keywords WHERE")) return [{ id: values[0] }];
  if (sql.startsWith("SELECT l.id FROM locations l JOIN keywords k"))
    return [{ id: "location_active" }];
  if (sql.includes("SELECT id FROM users WHERE")) return [{ id: values[0] }];
  if (
    sql.includes("SELECT role FROM memberships WHERE") ||
    sql.includes("SELECT role::text AS role FROM memberships WHERE")
  )
    return [{ role: "admin" }];
  return undefined;
}

export function definitionQueryText(query: Parameters<typeof definitionQueryFixture>[0]) {
  return ("strings" in query ? query.strings : query).join("?");
}
