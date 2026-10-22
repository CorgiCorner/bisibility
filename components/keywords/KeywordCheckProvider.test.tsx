import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { KeywordCheckProvider } from "./KeywordCheckProvider";

it.each([null, "unknown", "", "   "])("explains missing historical provider %s", (provider) => {
  render(<KeywordCheckProvider provider={provider} />);
  expect(screen.getByText("Provider not recorded")).toBeVisible();
  expect(screen.queryByText(/via Unknown/i)).not.toBeInTheDocument();
});

it("retains the name of a recorded provider", () => {
  render(<KeywordCheckProvider provider="serpapi" />);
  expect(screen.getByText("via SerpApi")).toBeVisible();
});
