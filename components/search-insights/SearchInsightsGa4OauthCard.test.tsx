import { ToastProvider } from "@/components/ui/Toast";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SearchInsightsGa4OauthCard } from "./SearchInsightsGa4OauthCard";

it("preserves the current view in the GA4 reconnect href", () => {
  const returnPath = "/app/prj_1/search-console?property=sc-domain%3Abisibility.com&period=28";
  render(
    <ToastProvider>
      <SearchInsightsGa4OauthCard
        cancelAction={vi.fn()}
        completeAction={vi.fn()}
        disconnectAction={vi.fn()}
        oauth={{
          error: "Google reported the connection was declined.",
          provider: "ga4",
          setup: null,
        }}
        projectId="prj_1"
        returnPath={returnPath}
      />
    </ToastProvider>,
  );

  const href =
    screen.getByRole("link", { name: "Try connecting again" }).getAttribute("href") ?? "";
  expect(new URL(href, "https://example.com").searchParams.get("returnPath")).toBe(returnPath);
});
