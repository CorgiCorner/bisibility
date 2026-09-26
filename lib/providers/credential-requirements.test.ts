import { describe, expect, it } from "vitest";
import { providerCredentialRequirementMessage } from "./credential-requirements";
import { PROVIDER_CATALOG } from "./registry";

function catalogItem(id: string) {
  const item = PROVIDER_CATALOG.find((provider) => provider.id === id);
  if (!item) throw new Error(`Expected ${id} in the catalog.`);
  return item;
}

describe("providerCredentialRequirementMessage", () => {
  it("names the Plausible site domain instead of a generic API login", () => {
    expect(providerCredentialRequirementMessage(catalogItem("plausible"), { apiKey: "t" })).toBe(
      "Plausible requires a site domain (login) credential.",
    );
    expect(providerCredentialRequirementMessage(catalogItem("plausible"), {})).toBe(
      "Plausible requires API token (api_key) and site domain (login) credentials.",
    );
  });

  it("keeps the generic labels for providers without overrides", () => {
    expect(providerCredentialRequirementMessage(catalogItem("dataforseo"), { login: "me" })).toBe(
      "DataForSEO requires an API password credential.",
    );
  });

  it("returns null when nothing is missing", () => {
    expect(
      providerCredentialRequirementMessage(catalogItem("plausible"), {
        apiKey: "t",
        login: "example.com",
      }),
    ).toBeNull();
  });
});
