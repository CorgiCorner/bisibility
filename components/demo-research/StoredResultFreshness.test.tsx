import {
  renderWithFeatureMessages as render,
  researchFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoredResultFreshness } from "./StoredResultFreshness";

describe("StoredResultFreshness", () => {
  it("uses the document formatter and demo catalog for generated stored-data prose", () => {
    const messages = structuredClone(researchFeatureTestMessages);
    messages.projectResearch.demo.collected = "Zebrano {date}";
    messages.projectResearch.demo.freshFor = "Świeże przez {days, number} dni";
    messages.projectResearch.demo.storedResult = "Zapisany wynik";

    render(
      <StoredResultFreshness fetchedAt="2026-01-02T03:04:00.000Z" freshUntil="" stale={false} />,
      { locale: "pl", messages, timeZone: "UTC" },
    );

    expect(screen.getByText("Zapisany wynik")).toBeInTheDocument();
    expect(screen.getByText(/Zebrano/)).toBeInTheDocument();
    expect(screen.getByText("Świeże przez 30 dni")).toBeInTheDocument();
  });
});
