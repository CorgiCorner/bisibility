export const providerSchemas = {
  Provider: {
    properties: {
      capabilities: {
        description:
          "Provider-implemented features; true only while the connection is connected and enabled.",
        properties: {
          backlinks: { type: "boolean" },
          domain_overview: { type: "boolean" },
          keyword_metrics: { type: "boolean" },
          keyword_research: { type: "boolean" },
          rank_checks: { type: "boolean" },
          search_performance: { type: "boolean" },
        },
        required: [
          "backlinks",
          "domain_overview",
          "keyword_metrics",
          "keyword_research",
          "rank_checks",
          "search_performance",
        ],
        type: "object",
      },
      category_id: { enum: ["serp", "analytics"], type: "string" },
      category_title: { type: "string" },
      connected: {
        description: "Credentials on file are valid; enabled may still be false.",
        type: "boolean",
      },
      connection_id: {
        pattern: "^conn_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      connection_status: { enum: ["connected", "needs_reauth", "not_connected"], type: "string" },
      enabled: { type: "boolean" },
      id: { description: "Natural provider catalog ID.", type: "string" },
      kind: { enum: ["serp", "analytics"], type: "string" },
      last_used_at: { format: "date-time", type: ["string", "null"] },
      name: { type: "string" },
      primary: { type: "boolean" },
      priority: { type: "integer" },
      status: {
        description: "catalog state of the integration, not the connection; read connection_status",
        type: "string",
      },
    },
    required: [
      "category_id",
      "category_title",
      "id",
      "kind",
      "name",
      "status",
      "connection_status",
      "connected",
      "capabilities",
      "last_used_at",
    ],
    type: "object",
  },
};
