import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import polishSharedMessages from "@/messages/core/pl/shared.json";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketChip } from "./MarketChip";

describe("a market chip in a non-English locale", () => {
  it("resolves the persisted English country and language names from their codes", () => {
    renderWithFeatureMessages(
      <MarketChip
        countryCode="BE"
        languageCode="ar"
        languageLabel="Arabic"
        locationLabel="Belgium"
      />,
      { locale: "pl", messages: polishSharedMessages },
    );

    expect(screen.getByText("Belgia")).toBeVisible();
    expect(screen.getByText("/ arabski")).toBeVisible();
    expect(screen.queryByText("Belgium")).not.toBeInTheDocument();
  });

  it("keeps a label that is not an English display name, such as a city", () => {
    renderWithFeatureMessages(
      <MarketChip
        countryCode="ES"
        languageCode="es"
        languageLabel="Spanish"
        locationLabel="Madrid"
      />,
      { locale: "pl", messages: polishSharedMessages },
    );

    expect(screen.getByText("Madrid")).toBeVisible();
    expect(screen.getByText("/ hiszpański")).toBeVisible();
  });
});
