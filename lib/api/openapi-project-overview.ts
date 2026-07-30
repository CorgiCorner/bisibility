import type { schemas } from "./openapi-components";
import { projectOverviewParameters } from "./openapi-parameters";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

export function projectOverviewPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/overview": {
      get: input.bearer(
        "Get a numeric project overview",
        "getProjectOverview",
        input.ref("ProjectOverview"),
        undefined,
        projectOverviewParameters,
      ),
    },
  };
}
