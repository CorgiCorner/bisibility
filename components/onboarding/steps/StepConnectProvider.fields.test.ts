import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { describe, expect, it } from "vitest";
import {
  costPerCheckCentsFromUsd,
  onboardingConnectProviderSchemaForConnections,
  providerOptions,
  savedProviderCompletionInput,
} from "./StepConnectProvider.fields";

const emptyCredentials = {
  login: "",
  projectId: "prj_1",
  providerId: "dataforseo" as const,
  secret: "",
};

describe("provider options", () => {
  it("derives the SerpApi free allowance from the canonical rate table", () => {
    const serpApiRate = rateForProvider("serpapi");
    const freePlan =
      serpApiRate?.pricingModel === "plan"
        ? serpApiRate.plans.find((plan) => plan.planKey === "free")
        : undefined;

    expect(freePlan).toBeDefined();
    expect(providerOptions.map(({ costCaption, value }) => ({ costCaption, value }))).toEqual([
      { costCaption: "Pay per check - from ~$0.002", value: "dataforseo" },
      {
        costCaption: `Plan-based - monthly search quota, ${freePlan?.includedChecks} searches/mo free`,
        value: "serpapi",
      },
    ]);
  });
});

describe("costPerCheckCentsFromUsd", () => {
  it("converts a USD form value to cents", () => {
    expect(costPerCheckCentsFromUsd(0.0155)).toBeCloseTo(1.55, 6);
  });

  it("returns null for undefined and non-positive values", () => {
    expect(costPerCheckCentsFromUsd(undefined)).toBeNull();
    expect(costPerCheckCentsFromUsd(0)).toBeNull();
  });

  it("accepts empty credentials for an already-connected provider", () => {
    const schema = onboardingConnectProviderSchemaForConnections({
      dataforseo: {},
    });

    expect(schema.safeParse(emptyCredentials).success).toBe(true);
  });

  it("does not carry form values when continuing with a saved provider", () => {
    expect(savedProviderCompletionInput("prj_1", "serpapi")).toEqual({
      projectId: "prj_1",
      providerId: "serpapi",
    });
  });

  it("rejects empty credentials for a provider without a stored connection", () => {
    const result = onboardingConnectProviderSchemaForConnections({}).safeParse(emptyCredentials);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        "Enter your API login.",
        "Enter your API password.",
      ]);
    }
  });
});
