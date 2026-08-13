const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description: string) => ({ content: json(schema), description });

export function runRankCheckOperation(input: {
  asyncParameter: object;
  problemResponses: object;
  rankCheckRef: object;
  security: object[];
}) {
  return {
    operationId: "runRankCheck",
    parameters: [input.asyncParameter],
    responses: {
      "201": response(input.rankCheckRef, "Rank check completed"),
      "202": response(input.rankCheckRef, "Rank check started"),
      "503": response({ $ref: "#/components/schemas/Problem" }, "Scheduler unavailable"),
      ...input.problemResponses,
    },
    security: input.security,
    summary: "Run one rank check synchronously or asynchronously",
  };
}

export function createSignalOperation(input: { problemResponses: object; security: object[] }) {
  return {
    operationId: "createSignal",
    requestBody: {
      content: json({ $ref: "#/components/schemas/SignalCreate" }),
      required: true,
    },
    responses: {
      "201": response({ $ref: "#/components/schemas/Signal" }, "Signal ingested"),
      "423": response({ $ref: "#/components/schemas/Problem" }, "Project read-only"),
      ...input.problemResponses,
    },
    security: input.security,
    summary: "Ingest a project signal",
  };
}
