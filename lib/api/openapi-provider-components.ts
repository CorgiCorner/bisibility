const MAX_BUDGET_AMOUNT = 2_147_483_647;

function budgetSchema(units: readonly string[], description: string) {
  return {
    description,
    oneOf: [
      {
        additionalProperties: false,
        properties: {
          amount_per_month: { maximum: MAX_BUDGET_AMOUNT, minimum: 1, type: "integer" },
          unit: { enum: units, type: "string" },
        },
        required: ["amount_per_month", "unit"],
        type: "object",
      },
      { type: "null" },
    ],
  };
}

const ownBudget = budgetSchema(
  ["cents", "units"],
  "Monthly budget on the project's own keys, in the provider unit: cents of provider charges or native units (searches). Null means no budget.",
);
const creditsBudget = budgetSchema(
  ["cents"],
  "Monthly budget on credits, in cents of credits spent. Null means no budget.",
);

function surfaceBudgets(budget: ReturnType<typeof budgetSchema>, required: boolean) {
  return {
    additionalProperties: false,
    properties: {
      app: { ...budget, description: `App and schedules. ${budget.description}` },
      programmatic: { ...budget, description: `API, MCP, SDK and CLI. ${budget.description}` },
    },
    ...(required ? { required: ["app", "programmatic"] } : {}),
    type: "object",
  };
}

export const providerBudgetSchemas = {
  ProviderBudgets: {
    description:
      "Monthly budgets of one provider connection. Own keys and credits have separate budgets and separate usage; only the source the connection runs on today is enforced.",
    properties: {
      connection_id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      credential_source: {
        description: "The source the connection runs on today: own keys or credits (hosted).",
        enum: ["own", "hosted"],
        type: "string",
      },
      credits: surfaceBudgets(creditsBudget, true),
      own: surfaceBudgets(ownBudget, true),
      provider: { description: "Natural provider catalog ID.", type: "string" },
      source: {
        description:
          "Where the own-keys budget comes from: the connection, the legacy project cap, or none.",
        enum: ["connection", "legacy_project", "none"],
        type: "string",
      },
    },
    required: ["connection_id", "credential_source", "credits", "own", "provider", "source"],
    type: "object",
  },
  ProviderBudgetsUpdate: {
    additionalProperties: false,
    description: "Omitted fields keep their stored budget; null clears a budget.",
    properties: {
      credits: surfaceBudgets(creditsBudget, false),
      own: surfaceBudgets(ownBudget, false),
    },
    type: "object",
  },
};

export const providerSchemas = {
  ...providerBudgetSchemas,
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
