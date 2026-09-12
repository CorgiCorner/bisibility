import { SearchSyncStatusControl } from "@/components/search-insights/SearchSyncStatusControl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const reconnectModel = {
  action: "reconnect" as const,
  actionLabel: "Connect Search Console",
  queueReason: null,
  semanticState: "not_connected" as const,
  status: "Reconnect required" as const,
  supportingText: "Reconnect Search Console to continue importing.",
};

describe("SearchSyncStatusControl", () => {
  it("keeps reconnect as a live install link for editors", () => {
    render(
      <SearchSyncStatusControl
        model={reconnectModel}
        reconnectHref="/api/integrations/google/install?provider=gsc"
      />,
    );

    expect(screen.getByRole("link", { name: "Connect Search Console" })).toHaveAttribute(
      "href",
      "/api/integrations/google/install?provider=gsc",
    );
  });

  it("replaces reconnect with an ask-admin cue instead of an install link", () => {
    render(
      <SearchSyncStatusControl
        disabled
        model={reconnectModel}
        reconnectHref="/api/integrations/google/install?provider=gsc"
      />,
    );

    expect(screen.queryByRole("link", { name: "Connect Search Console" })).not.toBeInTheDocument();
    expect(screen.queryByText("Connect Search Console")).not.toBeInTheDocument();
    expect(screen.getByText("Ask a project admin to connect")).toBeInTheDocument();
  });
});
