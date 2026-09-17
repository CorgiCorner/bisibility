import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Loading from "./loading";

const mocks = vi.hoisted(() => ({
  createTranslator: vi.fn(),
  loadMessages: vi.fn(),
  resolveLocale: vi.fn(),
}));

vi.mock("@/components/search-insights/SearchInsightsLoadingSkeletons", () => ({
  SearchInsightsPageLoading: ({
    bodyAriaLabel,
    pageAriaLabel,
  }: {
    bodyAriaLabel: string;
    pageAriaLabel: string;
  }) => (
    <section aria-label={pageAriaLabel} aria-live="polite">
      <span aria-label={bodyAriaLabel} />
    </section>
  ),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveLocale,
}));
vi.mock("@/i18n/translator.server", () => ({ createIntlTranslator: mocks.createTranslator }));

describe("Search Insights loading route", () => {
  it("passes the route's localized server labels to the page skeleton", async () => {
    mocks.resolveLocale.mockResolvedValue({ locale: "pl", timeZone: "UTC" });
    mocks.loadMessages.mockResolvedValue({ projectSearchInsights: { copy: {} } });
    mocks.createTranslator.mockReturnValue((key: string) =>
      key.endsWith("searchInsightsPageLoading")
        ? "Ladowanie strony Search Console"
        : "Ladowanie danych Search Console",
    );

    render(await Loading());

    expect(screen.getByRole("region", { name: "Ladowanie strony Search Console" })).toBeVisible();
    expect(screen.getByLabelText("Ladowanie danych Search Console")).toBeInTheDocument();
  });
});
