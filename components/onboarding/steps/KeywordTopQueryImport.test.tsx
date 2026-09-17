import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import {
  renderWithOnboardingMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeywordTopQueryImport, type KeywordTopQueryImportMessages } from "./KeywordTopQueryImport";
import { topQueryImportMessages } from "./keyword-import-messages";

function noop() {}

const costContext = {
  cronExpression: null,
  depth: 100 as const,
  deviceCount: 1,
  frequency: "daily" as const,
  locationCount: 1,
  overrideCents: null,
  providerId: "dataforseo",
};

function LocalizedTopQueryImport({
  messages,
  ...props
}: Omit<ComponentProps<typeof KeywordTopQueryImport>, "messages"> & {
  messages?: KeywordTopQueryImportMessages;
}) {
  const t = useTranslations("onboarding.keywords");
  return <KeywordTopQueryImport {...props} messages={messages ?? topQueryImportMessages(t)} />;
}

describe("KeywordTopQueryImport", () => {
  it("renders nothing without a connected Search Console property", () => {
    const { container } = render(
      <LocalizedTopQueryImport
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource={false}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the import action once an analytics source is connected", () => {
    render(
      <LocalizedTopQueryImport
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Import top queries from Search Console/ }),
    ).toBeInTheDocument();
  });

  it("maps the actual rate-limit action error to the feature locale and hides unknown provider text", async () => {
    const messages = mergeMessageCatalogs(sharedMessages, {
      onboarding: {
        ...onboardingMessages.onboarding,
        keywords: {
          ...onboardingMessages.onboarding.keywords,
          import: {
            ...onboardingMessages.onboarding.keywords.import,
            loadError: "Nie udalo sie pobrac zapytan.",
            rateLimited: "Limit zapytan.",
          },
        },
      },
    });
    const rateLimited = vi.fn(async () => {
      throw new Error("Rate limited, try again shortly.");
    });
    const unknownProvider = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const props = {
      costContext,
      currentKeywords: "",
      hasAnalyticsSource: true,
      onAppendQueries: noop,
      projectId: "prj_1",
    };
    const view = renderWithFeatureMessages(
      <LocalizedTopQueryImport {...props} importTopQueriesAction={rateLimited} />,
      { locale: "pl", messages },
    );
    fireEvent.click(screen.getByRole("button", { name: /Import top queries/ }));
    await waitFor(() => expect(screen.getByText("Limit zapytan.")).toBeInTheDocument());

    view.rerender(<LocalizedTopQueryImport {...props} importTopQueriesAction={unknownProvider} />);
    fireEvent.click(screen.getByRole("button", { name: /Import top queries/ }));
    await waitFor(() =>
      expect(screen.getByText("Nie udalo sie pobrac zapytan.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("provider unavailable")).not.toBeInTheDocument();
  });

  it("passes its localized drawer contract through the actual import flow", async () => {
    const messages = mergeMessageCatalogs(sharedMessages, {
      onboarding: {
        ...onboardingMessages.onboarding,
        keywords: {
          ...onboardingMessages.onboarding.keywords,
          import: {
            ...onboardingMessages.onboarding.keywords.import,
            drawer: {
              ...onboardingMessages.onboarding.keywords.import.drawer,
              description: "Zapytania oczyszczone z Search Console. Wybierz te do sledzenia.",
              filterAria: "Filtruj propozycje",
              filterPlaceholder: "Filtruj zapytania",
              title: "Import z Search Console",
            },
          },
        },
      },
    });
    const importTopQueriesAction = vi.fn(async () => ({
      queries: [],
      suggestions: Array.from({ length: 26 }, (_, index) => ({
        clicks: index + 1,
        impressions: index + 10,
        query: `query ${index + 1}`,
      })),
    }));
    renderWithFeatureMessages(
      <LocalizedTopQueryImport
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource
        importTopQueriesAction={importTopQueriesAction}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: /Import top queries/ }));

    expect(await screen.findByRole("dialog", { name: "Import z Search Console" })).toBeVisible();
    expect(
      screen.getByText("Zapytania oczyszczone z Search Console. Wybierz te do sledzenia."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filtruj propozycje" })).toHaveAttribute(
      "placeholder",
      "Filtruj zapytania",
    );
  });

  it("formats selected counts, costs, and large metrics through the injected Polish contract", async () => {
    const messages = mergeMessageCatalogs(sharedMessages, {
      onboarding: {
        ...onboardingMessages.onboarding,
        keywords: {
          ...onboardingMessages.onboarding.keywords,
          import: {
            ...onboardingMessages.onboarding.keywords.import,
            drawer: {
              ...onboardingMessages.onboarding.keywords.import.drawer,
              clicks: "Klikniecia",
              metric: "{value, number}",
              metricUnavailable: "brak",
              monthlyChecks: "Wybrano {count, number}; +{checks, number} kontroli/mies.",
              monthlyChecksCostBelowCent:
                "Wybrano {count, number}; +{checks, number} kontroli/mies. - mniej niz {minimum, number, ::currency/USD}/mies.",
              monthlyChecksCost:
                "Wybrano {count, number}; +{checks, number} kontroli/mies. - {cost, number, ::currency/USD}/mies.",
              selectionCount: "Wybrano {count, number}",
            },
          },
        },
      },
    });
    const suggestions = [
      { clicks: 12_345, impressions: 67_890, query: "one" },
      { clicks: 12_344, impressions: 67_889, query: "two" },
      { clicks: 12_343, impressions: 67_888, query: "three" },
      { clicks: 12_342, impressions: 67_887, query: "four" },
      { clicks: 12_341, impressions: 67_886, query: "five" },
    ];
    renderWithFeatureMessages(
      <LocalizedTopQueryImport
        costContext={{ ...costContext, overrideCents: 200 }}
        currentKeywords=""
        hasAnalyticsSource
        importTopQueriesAction={vi.fn(async () => ({ queries: [], suggestions }))}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: /Import top queries/ }));
    await screen.findByRole("dialog");
    expect(document.body.textContent).toContain(new Intl.NumberFormat("pl-PL").format(12_345));
    expect(document.body.textContent).toContain(new Intl.NumberFormat("pl-PL").format(67_890));
    expect(screen.getByText(/Wybrano 3; \+/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText(/Wybrano 0; \+0 kontroli/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("one"));
    expect(screen.getByText(/Wybrano 1; \+/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("two"));
    expect(screen.getByText(/Wybrano 2; \+/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText(/Wybrano 5; \+/)).toBeInTheDocument();
    expect(screen.getByText(/USD\/mies\./)).toBeInTheDocument();
  });

  it("keeps unavailable cost and schedule clauses explicit in the injected contract", async () => {
    const messages = mergeMessageCatalogs(sharedMessages, {
      onboarding: {
        ...onboardingMessages.onboarding,
        keywords: {
          ...onboardingMessages.onboarding.keywords,
          import: {
            ...onboardingMessages.onboarding.keywords.import,
            drawer: {
              ...onboardingMessages.onboarding.keywords.import.drawer,
              monthlyChecks: "Kontrole {count, number}: {checks, number}",
              monthlyChecksCostBelowCent: "Ponizej {minimum, number, ::currency/USD}",
              monthlyChecksCost: "Koszt {cost, number, ::currency/USD}",
              selectionCount: "Tylko wybor {count, number}",
            },
          },
        },
      },
    });
    const action = vi.fn(async () => ({ queries: [], suggestions: [{ query: "one" }] }));
    const { rerender } = renderWithFeatureMessages(
      <LocalizedTopQueryImport
        costContext={{ ...costContext, providerId: "unknown" }}
        currentKeywords=""
        hasAnalyticsSource
        importTopQueriesAction={action}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: /Import top queries/ }));
    expect(await screen.findByText(/Kontrole 1:/)).toBeInTheDocument();
    expect(screen.queryByText(/Koszt/)).not.toBeInTheDocument();

    rerender(
      <LocalizedTopQueryImport
        costContext={{ ...costContext, cronExpression: null, frequency: "custom_cron" }}
        currentKeywords=""
        hasAnalyticsSource
        importTopQueriesAction={action}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );
    expect(screen.getByText("Tylko wybor 1")).toBeInTheDocument();
  });

  it("keeps zero, sub-cent, cent, and regular estimates distinct in the Polish footer", async () => {
    const messages = mergeMessageCatalogs(sharedMessages, {
      onboarding: {
        ...onboardingMessages.onboarding,
        keywords: {
          ...onboardingMessages.onboarding.keywords,
          import: {
            ...onboardingMessages.onboarding.keywords.import,
            drawer: {
              ...onboardingMessages.onboarding.keywords.import.drawer,
              monthlyChecksCostBelowCent: "Ponizej {minimum, number, ::currency/USD}",
              monthlyChecksCost: "Koszt {cost, number, ::currency/USD}",
            },
          },
        },
      },
    });
    const action = vi.fn(async () => ({ queries: [], suggestions: [{ query: "one" }] }));
    const props = {
      currentKeywords: "",
      hasAnalyticsSource: true,
      importTopQueriesAction: action,
      onAppendQueries: noop,
      projectId: "prj_1",
    };
    const view = renderWithFeatureMessages(
      <LocalizedTopQueryImport
        {...props}
        costContext={{ ...costContext, depth: 10, frequency: "monthly", overrideCents: 0 }}
      />,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: /Import top queries/ }));
    expect(await screen.findByText(/Koszt 0,00\sUSD/)).toBeInTheDocument();

    for (const [overrideCents, expected] of [
      [0.1, /Ponizej 0,01\sUSD/],
      [1, /Koszt 0,01\sUSD/],
      [125, /Koszt 1,25\sUSD/],
    ] as const) {
      view.rerender(
        <LocalizedTopQueryImport
          {...props}
          costContext={{ ...costContext, depth: 10, frequency: "monthly", overrideCents }}
        />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  });
});
