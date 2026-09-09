import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ProviderCredentialForm } from "./steps/ProviderCredentialForm";
import { StepConnectGscCard } from "./steps/StepConnectGscCard";

function Credentials() {
  const form = useForm({
    defaultValues: { login: "person@example.com", secret: "private-fixture" },
  });
  return (
    <ProviderCredentialForm
      busy={false}
      errors={{}}
      fields={[
        { name: "login", label: "Login", type: "text", placeholder: "Login" },
        { name: "secret", label: "Password", type: "password", placeholder: "Password" },
      ]}
      onSave={vi.fn()}
      onTest={vi.fn()}
      providerId="dataforseo"
      providerLabel="DataForSEO"
      registerField={form.register}
      testing={false}
      testResult={{ ok: false, message: "private provider response" }}
    />
  );
}

describe("rendered sensitive recording boundaries", () => {
  it("blocks credential inputs and provider responses together", () => {
    render(<Credentials />);
    for (const element of [
      screen.getByDisplayValue("person@example.com"),
      screen.getByDisplayValue("private-fixture"),
      screen.getByText("private provider response"),
    ]) {
      expect(element.closest("[data-analytics-block]")).not.toBeNull();
    }
  });
  it("blocks the connected Google property rendered in onboarding", () => {
    render(
      <StepConnectGscCard
        configured
        googleOAuth={{
          properties: [
            {
              label: "example.com",
              value: "sc-domain:example.com",
              kind: "domain",
              permissionLevel: "siteOwner",
            },
          ],
        }}
        projectId="project-fixture"
      />,
    );
    expect(
      screen.getByText("sc-domain:example.com").closest("[data-analytics-block]"),
    ).not.toBeNull();
  });
});
