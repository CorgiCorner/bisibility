import { describe, expect, it } from "vitest";
import {
  anyProviderVerified,
  costPerCheckCentsFromUsd,
  initialDrafts,
  onboardingConnectProviderSchemaForConnections,
} from "./StepConnectProvider.fields";

const emptyCredentials = {
  login: "",
  projectId: "prj_1",
  providerId: "dataforseo" as const,
  secret: "",
};

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
      dataforseo: { primary: true },
    });

    expect(schema.safeParse(emptyCredentials).success).toBe(true);
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

  it("keeps another provider eligible when the selected draft is unverified", () => {
    const dataForSeoValues = {
      ...emptyCredentials,
      login: "provider-login",
      secret: "provider-password",
    };

    expect(
      anyProviderVerified(
        {},
        initialDrafts(dataForSeoValues),
        { dataforseo: { message: "Connected", ok: true } },
        { dataforseo: "login:provider-login|secret:provider-password" },
        { ...dataForSeoValues, providerId: "serpapi", secret: "unverified-key" },
      ),
    ).toBe(true);
  });
});
