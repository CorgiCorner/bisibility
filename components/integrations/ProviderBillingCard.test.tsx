import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import integrations from "@/messages/core/en/project-integrations.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { type BillingConnection, ProviderBillingCard } from "./ProviderBillingCard";

it("groups the connected providers by billing source and expands long lists", () => {
  const connections: BillingConnection[] = [
    ...Array.from({ length: 7 }, (_, index) => ({
      connectionId: `own-${index}`,
      providerId: "serpapi",
      label: `Key ${index}`,
      credentialSource: "own" as const,
      billable: true,
    })),
    {
      connectionId: "hosted",
      providerId: "dataforseo",
      label: "DataForSEO",
      credentialSource: "hosted",
      billable: true,
    },
    {
      connectionId: "free",
      providerId: "gsc",
      label: "Search Console",
      credentialSource: "own",
      billable: false,
    },
  ];
  render(
    <FeatureMessagesProvider locale="en" messages={integrations} timeZone="UTC">
      <ProviderBillingCard connections={connections} manageHref="/providers" />
    </FeatureMessagesProvider>,
  );
  expect(screen.getByText("Credits")).toBeVisible();
  expect(screen.getByText("No usage cost")).toBeVisible();
  expect(screen.getByText("Search Console")).toBeVisible();
  expect(screen.queryByText("Key 6")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
  expect(screen.getByText("Key 6")).toBeVisible();
  const button = screen.getByRole("button", { name: "Show less" });
  expect(button).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(button);
  expect(screen.queryByText("Key 6")).toBeNull();
  expect(
    within(screen.getByRole("link", { name: "Manage connections" })).getByText(
      "Manage connections",
    ),
  ).toBeVisible();
});

it("omits the empty billing card when no providers are connected", () => {
  const { container } = render(
    <FeatureMessagesProvider locale="en" messages={integrations} timeZone="UTC">
      <ProviderBillingCard connections={[]} manageHref="/providers" />
    </FeatureMessagesProvider>,
  );
  expect(container).toBeEmptyDOMElement();
});
