import { ConversionSourceSwitch } from "@/components/conversions/ConversionSourceSwitch";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { SearchConsoleTabs } from "./page-indexing/SearchConsoleTabs";

const catalog = { ...shared, ...messages };

it("updates every Search Console tab on server re-render and history restoration", () => {
  const props = { base: "/app/prj_example/search-console", query: "period=28d", notIndexed: 2 };
  const { rerender } = renderWithFeatureMessages(
    <SearchConsoleTabs {...props} active="performance" />,
    { messages: catalog },
  );
  for (const [active, label] of [
    ["page-indexing", "Page indexing"],
    ["sitemaps", "Sitemaps"],
    ["performance", "Performance"],
  ] as const) {
    rerender(<SearchConsoleTabs {...props} active={active} />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(label);
  }
});

it("routes conversions selection and restores the selected source from props", async () => {
  setNavigationState({
    pathname: "/app/prj_example/search-console",
    searchParams: { tab: "performance", period: "28d" },
  });
  const options = [
    { label: "GA4", primary: true, source: "ga4" as const },
    { label: "Plausible", primary: false, source: "plausible" as const },
  ];
  const { rerender } = renderWithFeatureMessages(
    <ConversionSourceSwitch options={options} value="ga4" />,
    { messages: catalog },
  );
  const trigger = () => screen.getByRole("button");
  await userEvent.click(trigger());
  await userEvent.click(screen.getByRole("menuitem", { name: "Plausible" }));
  expect(routerMock.replace).toHaveBeenCalledWith(
    "/app/prj_example/search-console?tab=performance&period=28d&conv=plausible",
    { scroll: false },
  );
  rerender(<ConversionSourceSwitch options={options} value="plausible" />);
  expect(trigger()).toHaveTextContent("Plausible");
  rerender(<ConversionSourceSwitch options={options} value="ga4" />);
  expect(trigger()).toHaveTextContent("GA4");
});
