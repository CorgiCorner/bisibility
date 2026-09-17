import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { connectProviderSchema } from "@/lib/schemas/provider";
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
const validationMessages = {
  costPrecision: "Use up to 4 decimals.",
  credentialTooLong: "Credentials must be 500 characters or fewer.",
  loginRequired: "Enter your API login.",
  secretRequired: "Enter your API password.",
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
    const schema = onboardingConnectProviderSchemaForConnections(
      { dataforseo: {} },
      validationMessages,
    );

    expect(schema.safeParse(emptyCredentials).success).toBe(true);
  });

  it("does not carry form values when continuing with a saved provider", () => {
    expect(savedProviderCompletionInput("prj_1", "serpapi")).toEqual({
      projectId: "prj_1",
      providerId: "serpapi",
    });
  });

  it("rejects empty credentials for a provider without a stored connection", () => {
    const result = onboardingConnectProviderSchemaForConnections({}, validationMessages).safeParse(
      emptyCredentials,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        "Enter your API login.",
        "Enter your API password.",
      ]);
    }
  });

  it("uses the provided precision message for a form-visible decimal validation error", () => {
    const schema = onboardingConnectProviderSchemaForConnections(
      { dataforseo: {} },
      { ...validationMessages, costPrecision: "Podaj najwyzej 4 miejsca po przecinku." },
    );

    const result = schema.safeParse({ ...emptyCredentials, costPerCheck: 0.00001 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ message: "Podaj najwyzej 4 miejsca po przecinku." }),
      );
    }
  });

  it("keeps the server schema's default issue out of the localized form projection", () => {
    const oversizedSecret = "x".repeat(501);
    const rawResult = connectProviderSchema.safeParse({
      login: "login",
      projectId: "prj_1",
      providerId: "dataforseo",
      secret: oversizedSecret,
    });
    const projectedResult = onboardingConnectProviderSchemaForConnections(
      {},
      { ...validationMessages, credentialTooLong: "Wpisz najwyżej 500 znaków." },
    ).safeParse({
      login: "login",
      projectId: "prj_1",
      providerId: "dataforseo",
      secret: oversizedSecret,
    });

    expect(rawResult.success).toBe(false);
    expect(projectedResult.success).toBe(false);
    if (!rawResult.success && !projectedResult.success) {
      expect(rawResult.error.issues[0]?.message).toMatch(/^Too big:/);
      expect(projectedResult.error.issues).toContainEqual(
        expect.objectContaining({ message: "Wpisz najwyżej 500 znaków." }),
      );
    }
  });
});
