import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProviderUsageCard } from "./ProviderUsageCard";

vi.mock("@usagekit/react", async (original) => ({
  ...(await original<object>()),
  useProviderAction: () => ({ canReconcile: true }),
}));
vi.mock("./BudgetEditModal", () => ({ BudgetEditModal: () => null }));
const copies = [
  [
    "en",
    "Requests are blocked",
    "Budget warning",
    "Affected budgets: 2",
    "App and schedules",
    "API and agents",
  ],
  [
    "pl",
    "Żądania są zablokowane",
    "Ostrzeżenie o budżecie",
    "Liczba budżetów: 2",
    "Aplikacja i harmonogram",
    "API i agenci",
  ],
  [
    "es-ES",
    "Las solicitudes están bloqueadas",
    "Aviso de presupuesto",
    "Presupuestos afectados: 2",
    "Aplicación y programación",
    "API y agentes",
  ],
  [
    "ja",
    "リクエストはブロックされています",
    "予算の警告",
    "対象の予算: 2",
    "アプリとスケジュール",
    "APIとエージェント",
  ],
] as const;
it.each(copies.flatMap((copy) => [true, false].map((blocked) => [copy, blocked] as const)))(
  "localizes budget notice %j blocked=%s",
  async ([locale, blocked, warning, count, app, programmatic], isBlocked) => {
    const shared = (await import(`../../../messages/core/${locale}/shared.json`)).default;
    const settings = (await import(`../../../messages/core/${locale}/project-settings-usage.json`))
      .default;
    const messages = { ...shared, ...settings };
    const data = projectUsageFixture();
    data.budgets = [
      {
        ...data.budgets[0],
        id: "app",
        traffic: { kind: "surface", surface: "app" },
        level: "exceeded",
      },
      {
        ...data.budgets[0],
        id: "api",
        traffic: { kind: "surface", surface: "programmatic" },
        level: "warning",
      },
    ];
    if (!isBlocked) {
      data.budgets = data.budgets.map((row) => ({
        ...row,
        boundary: { onExceed: "allow", hardLimit: null },
        level: "warning",
      }));
      data.budgets.reverse();
    }
    renderWithFeatureMessages(
      <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
      { locale, messages },
    );
    const message = isBlocked ? blocked : warning;
    const bound = isBlocked ? app : programmatic;
    expect(
      screen.getByText(
        (text) => text.includes(message) && text.includes(bound) && text.includes(count),
      ),
    ).toBeInTheDocument();
    if (!isBlocked) expect(screen.queryByText((text) => text.includes(blocked))).toBeNull();
  },
);
