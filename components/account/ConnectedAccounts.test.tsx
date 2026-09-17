import {
  accountFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectedAccounts } from "./ConnectedAccounts";

const polishAccountMessages = {
  ...accountFeatureTestMessages,
  account: {
    ...accountFeatureTestMessages.account,
    connected: {
      ...accountFeatureTestMessages.account.connected,
      connectedDetail: "Połączono z {provider}",
      notConnectedDetail: "Brak połączenia. Logowanie odbywa się obecnie kodem e-mail.",
    },
  },
};

describe("ConnectedAccounts", () => {
  it("formats linked and unlinked providers through the narrow account catalog", () => {
    renderWithFeatureMessages(
      <ConnectedAccounts
        accounts={[
          { connected: true, provider: "github" },
          { connected: false, provider: "google" },
        ]}
        configuredProviders={{ github: true, google: false }}
      />,
      { locale: "pl", messages: polishAccountMessages },
    );

    expect(screen.getByText("Połączono z GitHub")).toBeVisible();
    expect(
      screen.getByText("Brak połączenia. Logowanie odbywa się obecnie kodem e-mail."),
    ).toBeVisible();
    expect(screen.queryByText("Connected to GitHub")).not.toBeInTheDocument();
  });
});
