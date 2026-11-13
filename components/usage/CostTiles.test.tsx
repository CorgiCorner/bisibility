import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { sharedControlTestMessages } from "@/i18n/test-support/feature-test-messages";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import costs from "@/messages/core/en/project-usage-costs.json";
import { describe, expect, it } from "vitest";
import { CostTiles } from "./CostTiles";

const messages = mergeMessageCatalogs(sharedControlTestMessages, costs);

describe("cost tiles", () => {
  it("shows each currency and a dash when a category is empty", () => {
    const view = renderWithFeatureMessages(
      <CostTiles
        tiles={{
          custom: [],
          provider: [{ currency: "USD", minor: 125 }],
          seo: [
            { currency: "USD", minor: 175 },
            { currency: "EUR", minor: 2_000 },
          ],
          subscriptions: [{ currency: "EUR", minor: 2_000 }],
        }}
      />,
      { messages },
    );
    expect(view.getByText("SEO cost this month")).toBeTruthy();
    expect(view.getByText("$1.75")).toBeTruthy();
    expect(view.getAllByText("€20.00")).toHaveLength(2);
    expect(view.getByText("$1.25")).toBeTruthy();
    expect(view.getAllByText("-").length).toBeGreaterThan(0);
    expect(view.getByText("Nothing recorded for this month.")).toBeTruthy();
  });
});
