import { OverviewDashboardView } from "@/components/overview/OverviewDashboardView";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import type { OverviewView } from "@/components/overview/types";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { AppLocale } from "@/i18n/config";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { CheckHealth } from "@/lib/queries/check-health";
import messages from "@/messages/core/en/project-dashboard.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

const emptyOverview = {
  ...overviewFixture,
  isEmpty: true,
  state: "empty",
  toolbar: { ...overviewFixture.toolbar, marketOptions: [] },
  trackedKeywordCount: 0,
} satisfies OverviewView;

const healthyChecks = {
  budget: { capCents: 5000, exhausted: false, spentCents: 0 },
  currentFailures: { count: 0, latestCheckId: null },
  failed24h: { count: 0, latest: null },
  providerConnected: false,
  providerRate: { overrideCents: null, providerId: null },
  runningCount: 0,
} satisfies CheckHealth;

const dashboardFeatureTestMessages = mergeMessageCatalogs(sharedMessages, messages);

function renderDashboard(
  children: ReactElement,
  scopedMessages = dashboardFeatureTestMessages,
  locale: AppLocale = "en",
) {
  return renderWithFeatureMessages(children, { locale, messages: scopedMessages, timeZone: "UTC" });
}

describe("OverviewDashboardView", () => {
  it("keeps the actual empty dashboard route and uses its injected non-English messages", () => {
    const nonEnglishMessages = mergeMessageCatalogs(sharedMessages, {
      ...messages,
      projectDashboard: {
        ...messages.projectDashboard,
        noData: {
          ...messages.projectDashboard.noData,
          addKeywords: "Añadir palabras clave",
          noRankingsYet: "Aún no hay rankings",
          readyDetail:
            "{count, plural, =0 {Añade palabras clave para comenzar el seguimiento.} one {# palabra clave está lista para la primera comprobación.} other {# palabras clave están listas para la primera comprobación.}}",
        },
      },
    });

    renderDashboard(
      <OverviewDashboardView
        canCreateKeyword
        checkHealth={healthyChecks}
        isSample={false}
        overview={emptyOverview}
      />,
      nonEnglishMessages,
      "es-ES" as AppLocale,
    );

    expect(screen.getByText("Aún no hay rankings")).toBeVisible();
    expect(screen.getByText("Añade palabras clave para comenzar el seguimiento.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Añadir palabras clave" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/rank-tracker?add=1",
    );
    expect(screen.queryByText("Welcome to Acme")).not.toBeInTheDocument();
  });

  it("renders the populated dashboard through a narrow non-English feature fixture", () => {
    const nonEnglishMessages = mergeMessageCatalogs(sharedMessages, {
      ...messages,
      projectDashboard: {
        ...messages.projectDashboard,
        dashboard: {
          ...messages.projectDashboard.dashboard,
          kpisAriaLabel: "Indicadores del resumen",
          viewAllKeywords: "Ver todas las palabras clave",
        },
        dataSource: {
          ...messages.projectDashboard.dataSource,
          checksThisMonth: "Comprobaciones este mes",
          description: "Cómo se recopilan los rankings de este proyecto",
          estimateProviderCost: "Coste estimado del proveedor",
          lastCheck: "Última comprobación",
          lastCheckVia: "Última comprobación mediante",
          nextCheck: "Próxima comprobación",
          primaryProvider: "Proveedor principal",
          relativeHoursFuture: "dentro de {value, number} h",
          relativeHoursPast: "hace {value, number} h",
          title: "Fuente de datos",
        },
        distribution: {
          ...messages.projectDashboard.distribution,
          chartAriaLabel: "Gráfico de distribución de posiciones. {summary}",
          definition:
            "Palabras clave agrupadas por posición actual. Las que están fuera del Top 100 no se muestran.",
          keywordCount:
            "{count, number} {count, plural, one {palabra clave} other {palabras clave}}",
          positionRange: "Posiciones de {start, number} a {end, number}",
          summaryItem:
            "{range}: {count, number} {count, plural, one {palabra clave} other {palabras clave}}",
          title: "Distribución de posiciones",
        },
        highlights: {
          ...messages.projectDashboard.highlights,
          attentionDescription: "Descensos, fuera del top 100 o comprobaciones fallidas",
          attentionTitle: "Necesita atención",
          awaitingFirstCheck: "Esperando la primera comprobación",
          deltaUp: "Sube {value, number}",
          emptyAttentionDescription: "Completa otra comprobación para comparar posiciones.",
          emptyAttentionTitle: "Necesita otra comprobación",
          enteredTop10: "Entró en el top 10 - {url}",
          gained: "Ganó {value, number} - {url}",
          latestCheckFailed: "La última comprobación falló",
          newTop10Description: "Ahora aparece en la primera página",
          newTop10Title: "Nuevo en el top 10",
          noData: "Sin datos",
          position: "#{value, number}",
          recentlyAddedDescription: "Añadidas en los últimos 7 días",
          recentlyAddedFirstCheckPending: "Añadida {age} · primera comprobación pendiente",
          recentlyAddedTitle: "Añadidas recientemente",
          winsDescription: "Las que más posiciones ganaron",
          winsTitle: "Mayores avances",
        },
        kpis: {
          ...messages.projectDashboard.kpis,
          averageComparison:
            "{direction, select, up {sube {value, number, ::.0} frente a la comprobación anterior} down {baja {value, number, ::.0} frente a la comprobación anterior} other {0 frente a la comprobación anterior}}",
          averagePosition: "Posición media",
          countChange:
            "{direction, select, positive {+{value, number}} negative {-{value, number}} other {{value, number}}}",
          countThisMonth: "+{value, number} este mes",
          inTop10: "En el top 10",
          trackedKeywords: "Palabras clave seguidas",
          visibility: "Visibilidad",
          visibilityDetail:
            "{measured, number} de {total, number}{limited, select, true { más recientes} other {}} palabras clave medidas",
          visibilityPercentage: "{value, number}%",
        },
        positionTrend: {
          ...messages.projectDashboard.positionTrend,
          chartAriaLabel:
            "Gráfico de tendencia de posición.{hasTakeaway, select, true { {takeaway}} other {}}",
          definition:
            "Posición media diaria de las palabras clave clasificadas. Cuanto más baja, mejor: el número 1 es el primero.",
          takeawayImprovedLast:
            "La posición media mejoró {value, number} en los últimos {days, number} {days, plural, one {día} other {días}}, liderada por {leader}.",
          title: "Tendencia de posiciones",
        },
        toolbar: {
          ...messages.projectDashboard.toolbar,
          add: "Añadir",
          addKeyword: "Añadir palabra clave",
          allTags: "Todas las etiquetas",
          dateRangeAriaLabel: "Intervalo de fechas",
          last28Days: "Últimos 28 días",
          tagAriaLabel: "Etiqueta",
        },
      },
    });

    renderDashboard(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
      nonEnglishMessages,
      "es-ES" as AppLocale,
    );

    expect(screen.getByRole("heading", { name: "Tendencia de posiciones" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Distribución de posiciones" })).toBeVisible();
    expect(screen.getByText("Fuente de datos")).toBeVisible();
    expect(screen.getByText("Mayores avances")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver todas las palabras clave" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Intervalo de fechas" })).toHaveTextContent(
      "Últimos 28 días",
    );
    expect(screen.queryByText("Position trend")).not.toBeInTheDocument();
    expect(screen.queryByText("Data source")).not.toBeInTheDocument();
  });

  it("keeps the no-data dashboard instead of the orphaned welcome onboarding card", () => {
    renderDashboard(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={emptyOverview}
      />,
    );

    expect(screen.getByText("No rankings yet")).toBeVisible();
    expect(screen.queryByText(/Welcome to/)).not.toBeInTheDocument();
  });

  it("keeps the selected toolbar filters on the actual no-data dashboard", () => {
    renderDashboard(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={{
          ...emptyOverview,
          toolbar: {
            ...emptyOverview.toolbar,
            availableTags: ["Launch"],
            marketOptions: [{ label: "Spain", secondary: "Spanish", value: "loc_es_es" }],
            rangeValue: "7d",
            tagValue: "Launch",
          },
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("Last 7 days");
    expect(screen.getByRole("button", { name: "Tag" })).toHaveTextContent("Launch");
  });

  it("renders the populated dashboard keyword link as a serializable anchor", () => {
    renderDashboard(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    expect(screen.getByRole("link", { name: "View all keywords" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/rank-tracker",
    );
  });

  it("shows competitor data inside the populated dashboard without an experimental module", () => {
    renderDashboard(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
        competitors={{
          limited: false,
          rows: [
            {
              id: "cmp_rival",
              domain: "rival.test",
              label: "Rival",
              found: 5,
              checked: 8,
              above: 2,
              paired: 4,
              averagePosition: 3.4,
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("table", { name: "Competitor summary" })).toHaveTextContent(
      "https://rival.test",
    );
    expect(screen.queryByText("Rival")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://rival.test" })).toHaveAttribute(
      "href",
      "https://rival.test",
    );
    expect(screen.getByRole("link", { name: "https://rival.test" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "https://rival.test" })).toHaveClass(
      "font-medium",
      "text-fg",
      "hover:underline",
      "focus-visible:underline",
    );
    expect(screen.getByRole("link", { name: "https://rival.test" }).className).not.toContain(
      "accent",
    );
    expect(screen.getByText("5 / 8")).toBeVisible();
    expect(screen.getByText("2 / 4")).toBeVisible();
    expect(screen.queryByRole("link", { name: "View comparison" })).not.toBeInTheDocument();
  });

  it("shows safe billing copy without leaking the raw provider error", () => {
    const rawProviderError = "All SERP providers failed: dataforseo (Ok.)";
    const failedChecks = {
      ...healthyChecks,
      failed24h: {
        count: 1,
        latest: {
          checkedAt: "2026-08-24T12:00:00.000Z",
          error: rawProviderError,
          errorCode: "provider_billing",
          keyword: "open source rank tracker",
          provider: "dataforseo",
        },
      },
    } satisfies CheckHealth;

    renderDashboard(
      <OverviewDashboardView
        checkHealth={failedChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    expect(screen.queryByText(rawProviderError, { exact: false })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "open source rank tracker: The rank check could not run because the provider account has insufficient funds. Add funds or connect a different provider, then try again.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the sample banner above the no-data dashboard", () => {
    renderDashboard(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    expect(screen.getByText("This is a sample project")).toBeVisible();
    expect(screen.getByText("No rankings yet")).toBeVisible();
    expect(screen.queryByText(/Welcome to/)).not.toBeInTheDocument();
    expect(screen.queryByText(overviewFixture.kpis[0].value)).not.toBeInTheDocument();
  });
  it("uses one alert stack without an internal divider for a failed-check health banner", () => {
    const failedChecks = {
      ...healthyChecks,
      failed24h: {
        count: 1,
        latest: {
          checkedAt: "2026-08-24T12:00:00.000Z",
          error: "Provider timeout",
          errorCode: "provider_transient",
          keyword: "rank tracker",
          provider: "serpapi",
        },
      },
    } satisfies CheckHealth;

    renderDashboard(
      <OverviewDashboardView
        checkHealth={failedChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    const output = document.querySelector("output");
    expect(output?.parentElement).not.toHaveClass("border-b");
  });

  it("separates failed-check and budget health banners without a trailing divider", () => {
    const unhealthyChecks = {
      ...healthyChecks,
      budget: { capCents: 5000, exhausted: true, spentCents: 5000 },
      failed24h: {
        count: 1,
        latest: {
          checkedAt: "2026-08-24T12:00:00.000Z",
          error: "Provider timeout",
          errorCode: "provider_transient",
          keyword: "rank tracker",
          provider: "serpapi",
        },
      },
    } satisfies CheckHealth;

    renderDashboard(
      <OverviewDashboardView
        checkHealth={unhealthyChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    const entries = Array.from(
      document.querySelectorAll("output"),
      (output) => output.parentElement,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveClass("border-b", "border-border");
    expect(entries[1]).not.toHaveClass("border-b");
    expect(screen.getByRole("link", { name: "View check runs" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/runs",
    );
    expect(screen.getByRole("link", { name: "Raise the budget" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/settings#provider-usage",
    );
  });
});
