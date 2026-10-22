import { UsageSummary } from "@/components/integrations/UsageSummary";
import { NativeAllocationObservation } from "@/components/provider-management/AllocationEvidence";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { featureMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import en from "@/messages/core/en/project-settings-usage.json";
import sharedEn from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-settings-usage.json";
import sharedEs from "@/messages/core/es-ES/shared.json";
import ja from "@/messages/core/ja/project-settings-usage.json";
import sharedJa from "@/messages/core/ja/shared.json";
import pl from "@/messages/core/pl/project-settings-usage.json";
import sharedPl from "@/messages/core/pl/shared.json";
import { render, renderHook, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useUsagePresentation } from "./use-usage-presentation";

it.each([
  ["en", en, sharedEn],
  ["pl", pl, sharedPl],
  ["es-ES", es, sharedEs],
  ["ja", ja, sharedJa],
] as const)("renders rounded currency and localized labels in %s", (locale, messages, shared) => {
  const data = projectUsageFixture();
  data.summary.funding = [
    ...data.summary.funding,
    {
      ...data.summary.funding[0],
      key: "platform",
      fundingSource: "platform",
      cost: { text: "", unit: "cents", certainty: "unknown" },
      measurements: {
        customer_cents: { text: "12.3456", unit: "customer_cents", certainty: "measured" },
      },
    },
  ];
  render(
    featureMessagesElement(<UsageSummary data={data} />, {
      locale,
      messages: mergeMessageCatalogs(shared, messages),
    }),
  );
  expect(
    screen.getByRole("region", { name: shared.shared.usageViews.cost.title }),
  ).toBeInTheDocument();
  const expected = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(0.123456);
  expect(screen.getAllByText(expected.replace(/\s/g, " ")).length).toBeGreaterThan(0);
  const credits = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(12.3456);
  expect(screen.getAllByText(credits.replace(/\s/g, " ")).length).toBeGreaterThan(0);
  expect(screen.getAllByText(shared.shared.usageViews.units.customer_cents).length).toBeGreaterThan(
    0,
  );
  expect(screen.queryByText(shared.shared.usageViews.measurement.measured)).toBeNull();
  expect(screen.queryByText("projectSettingsUsage.views")).not.toBeInTheDocument();
});

it("loads common Usagekit labels from the shared message boundary", () => {
  const { result } = renderHook(() => useUsagePresentation(), {
    wrapper: ({ children }) =>
      featureMessagesElement(<>{children}</>, { locale: "en", messages: sharedEn }),
  });
  expect(result.current.summary.title).toBe("Usage");
});

it.each([
  ["en", sharedEn, "Paid attempts"],
  ["pl", sharedPl, "Płatne próby"],
  ["es-ES", sharedEs, "Intentos facturables"],
  ["ja", sharedJa, "有料の試行"],
] as const)(
  "distinguishes paid attempts from money and native units in %s",
  (locale, messages, label) => {
    const { result } = renderHook(() => useUsagePresentation(), {
      wrapper: ({ children }) => featureMessagesElement(<>{children}</>, { locale, messages }),
    });
    expect(result.current.unit("paid_attempts")).toBe(label);
    expect(result.current.unit("budget_cents")).toBe("");
  },
);

it.each([
  ["en", en, sharedEn, "As of"],
  ["pl", pl, sharedPl, "Stan na"],
  ["es-ES", es, sharedEs, "A fecha de"],
  ["ja", ja, sharedJa, "確認時刻"],
] as const)(
  "shows native balance observation time without exact-certainty noise in %s",
  (locale, messages, shared, label) => {
    const observedAt = "2026-10-21T16:52:00.000Z";
    const { container } = render(
      featureMessagesElement(
        <NativeAllocationObservation
          providerName="SerpApi"
          observation={{
            identity: {
              id: "row",
              connectionId: "conn",
              fundingSource: "byok",
              surface: "app",
              unit: "units",
              revision: "rev",
            },
            value: { text: "239", unit: "searches", certainty: "measured" },
            observedAt,
          }}
        />,
        { locale, messages: mergeMessageCatalogs(shared, messages) },
      ),
    );
    expect(
      screen.getByRole("button", { name: (name) => name.includes(label) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(messages.projectSettingsUsage.meter.certaintyValue.measured),
    ).toBeNull();
    expect(container.querySelector("time")).toHaveAttribute("datetime", observedAt);
  },
);
