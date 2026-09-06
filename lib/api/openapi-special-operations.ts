const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description: string) => ({ content: json(schema), description });

export function runRankCheckOperation(input: {
  problemResponses: object;
  rankCheckRef: object;
  rankCheckRunRef: object;
  security: object[];
}) {
  return {
    operationId: "runRankCheck",
    responses: {
      "201": response(input.rankCheckRef, "Rank check completed when inline execution is enabled"),
      "202": response(input.rankCheckRunRef, "Rank check queued"),
      ...input.problemResponses,
    },
    security: input.security,
    summary: "Queue one rank check",
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
