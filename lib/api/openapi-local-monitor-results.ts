import {
  localArray as array,
  localBoolean as boolean,
  localDate as date,
  localInteger as integer,
  localMonitorPartSchemas,
  localObjectBuilder,
  localNullable as nullable,
  localNumber as number,
  localText as text,
} from "./openapi-local-monitor-parts";
import { publicIdSchema } from "./openapi-public-id";

function parts(snake: boolean) {
  const object = localObjectBuilder(snake),
    body = localMonitorPartSchemas(snake);
  const version = { type: "integer", const: 1 };
  const window = nullable(
    object({
      from: nullable(date),
      to: date,
      timeBasis: { type: "string", const: "occurrence_created_at" },
    }),
  );
  const freshnessPolicy = nullable(
    object({
      basis: nullable({ type: "string", enum: ["manual_ttl", "captured_calendar"] }),
      freshForMs: nullable(number),
      freshnessReason: nullable(text),
      policyEpoch: nullable(text),
      configurationRevision: nullable(text),
      semantics: { type: "string", const: "current_project_policy_with_original_intent" },
    }),
  );
  const protocol = object({
    geometry: text,
    matcher: text,
    normalizerVersions: array(text, 100),
    metricDefinition: text,
  });
  const base = {
    version,
    projectId: publicIdSchema("prj"),
    monitorId: publicIdSchema("lmn"),
    runId: publicIdSchema("lmr"),
    asOf: date,
    definitionRevisionId: text,
    identityRevisionId: text,
    subject: text,
    protocol,
    financialBasis: { type: "string", const: "current_accounting_state" },
    freshnessPolicy,
    points: array(body.point, 100),
    grids: array(body.grid, 100),
  };
  return { object, body, base, window, version };
}
const { object, body, base, window, version } = parts(true);
const data = (value: object) => ({
  type: "object",
  properties: { data: value },
  required: ["data"],
});
const cursor = nullable({ type: "string", minLength: 1, maxLength: 8000 });
const camel = parts(false);

export const localMonitorResultSchemas = {
  LocalMonitorRunResult: data(
    object({
      ...base,
      createdAt: date,
      definitionRevision: integer,
      receipt: body.receipt,
    }),
  ),
  LocalMonitorRunHistory: data(
    object({
      version,
      projectId: publicIdSchema("prj"),
      monitorId: publicIdSchema("lmn"),
      asOf: date,
      window,
      eligibleTotal: nullable(integer),
      nextCursor: cursor,
      items: array(
        object({
          runId: publicIdSchema("lmr"),
          createdAt: date,
          definitionRevision: integer,
          mode: text,
        }),
        20,
      ),
    }),
  ),
  LocalMonitorPointHistory: data(
    object({
      version,
      asOf: date,
      targetId: publicIdSchema("lmt"),
      scope: { type: "string", const: "exact_captured_target" },
      limit: { type: "integer", const: 20 },
      hasMore: boolean,
      window,
      eligibleTotal: nullable(integer),
      nextCursor: cursor,
      policyEpoch: nullable(text),
      freshnessConfigurationRevision: nullable(text),
      items: array(
        object({
          id: text,
          runId: publicIdSchema("lmr"),
          createdAt: date,
          observedAt: nullable(date),
          position: nullable(number),
          evidence: text,
          reason: nullable(text),
          freshness: nullable(text),
          freshnessReason: nullable(text),
        }),
        20,
      ),
    }),
  ),
  LocalMonitorPointListings: data(array(body.listing, 700)),
  LocalMonitorPointReport: camel.object({
    ...camel.base,
    report: { type: "string", const: "local-point-report-v1" },
    scope: { type: "string", const: "sampled_points" },
    coordinateProof: { type: "string", const: "acknowledged_query_seed_or_unknown" },
    comparison: { type: "string", const: "unavailable" },
  }),
};
