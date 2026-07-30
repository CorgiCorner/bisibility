export type JsonObject = Record<string, unknown>;

export type McpToolDefinition = {
  annotations: {
    destructiveHint: boolean;
    readOnlyHint: boolean;
  };
  description: string;
  execution: {
    taskSupport: "forbidden";
  };
  inputSchema: JsonObject;
  name: string;
  title: string;
};
