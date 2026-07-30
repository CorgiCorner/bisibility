import type { schemas } from "./openapi-components";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

export function locationSearchPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/locations/search": {
      get: input.bearer(
        "Search supported keyword locations",
        "searchLocations",
        input.ref("LocationSuggestionsResponse"),
        undefined,
        [
          {
            in: "query",
            name: "q",
            required: true,
            schema: { maxLength: 120, minLength: 2, type: "string" },
          },
          { in: "query", name: "country", schema: { maxLength: 120, type: "string" } },
          {
            in: "query",
            name: "limit",
            schema: { default: 20, maximum: 100, minimum: 1, type: "integer" },
          },
        ],
      ),
    },
  };
}
