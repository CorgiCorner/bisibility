import {
  providerCredentialFieldsFor,
  SAVED_SECRET_DESCRIPTION,
} from "@/lib/integrations/credential-fields";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { render, renderHook, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { CredentialFields } from "./ConnectDrawerControls";
import type { ConnectFormValues } from "./ConnectDrawerSchema";
import { integrationCategories } from "./integrations-fixtures";

describe("integration credential descriptions", () => {
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
