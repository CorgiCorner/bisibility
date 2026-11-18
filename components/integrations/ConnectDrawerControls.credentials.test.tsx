import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import {
  providerCredentialFieldsFor,
  SAVED_SECRET_DESCRIPTION,
} from "@/lib/integrations/credential-fields";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { renderHook, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { CredentialFields } from "./ConnectDrawerControls";
import type { ConnectFormValues } from "./ConnectDrawerSchema";
import { integrationCategories } from "./integrations-fixtures";

describe("integration credential descriptions", () => {
  it.each(["openai", "anthropic", "openrouter", "vercel_ai_gateway"])(
    "labels %s as an API key and preserves masked saved state",
    (id) => {
      const fixture = integrationCategories[0].providers[0];
      const provider: IntegrationProviderData = {
        ...fixture,
        id,
        kind: "model",
        name: id,
        drawer: {
          ...fixture.drawer,
          credentialFields: providerCredentialFieldsFor(id, { connected: true }),
        },
      };
      const { result } = renderHook(() => useForm<ConnectFormValues>());
      render(<CredentialFields errors={{}} form={result.current} provider={provider} />);
      const field = screen.getByLabelText("API key");
      expect(field).toHaveAttribute("placeholder", "••••••••");
      expect(field).toHaveAccessibleDescription(SAVED_SECRET_DESCRIPTION);
      expect(screen.queryByLabelText("Client secret")).not.toBeInTheDocument();
    },
  );

  it.each([false, true])("preserves the API password label when connected=%s", (connected) => {
    const fixture = integrationCategories[0].providers[0];
    const provider: IntegrationProviderData = {
      ...fixture,
      drawer: {
        ...fixture.drawer,
        credentialFields: providerCredentialFieldsFor("dataforseo", { connected }),
      },
      status: connected ? "connected" : "ready",
    };
    const { result } = renderHook(() => useForm<ConnectFormValues>());
    render(<CredentialFields errors={{}} form={result.current} provider={provider} />);

    const password = screen.getByLabelText("API password");
    expect(password).toHaveAccessibleName("API password");
    expect(password).toHaveAccessibleDescription(
      connected ? SAVED_SECRET_DESCRIPTION : "Use your API password, not your account password.",
    );
  });
});
