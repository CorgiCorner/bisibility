import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: unknown) => String(value) }),
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string, values?: { providers: string }) =>
    namespace === "shared.providerAccess"
      ? sharedMessages.shared.providerAccess[
          key as keyof typeof sharedMessages.shared.providerAccess
        ].replace("{providers}", values?.providers ?? "")
      : key,
}));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import { AiResearchWorkspace } from "./AiResearchWorkspace";

describe("workspace without usable provider credentials", () => {
  it.each(["prompt", "visibility"] as const)(
    "keeps %s reports readable and prevents submission",
    (mode) => {
      const analyze = vi.fn();
      render(
        <AiResearchWorkspace
          projectId="prj_example"
          domain="acme.com"
          mode={mode}
          catalogFailure="no_source"
          supportingProviders={["Fixture AI provider"]}
          analyzeAction={analyze}
          history={[{ id: "agr_saved", title: "Saved report", createdAt: "2026-10-06" }]}
        />,
      );
      expect(
        screen.getByText("Choose a supported data source in Providers to run a search."),
      ).toBeVisible();
      expect(screen.getAllByText("Supported providers: Fixture AI provider.")).toHaveLength(1);
      if (mode === "prompt") {
        expect(screen.queryByRole("textbox", { name: "brand" })).toBeNull();
        expect(screen.queryByRole("button", { name: "estimateCost" })).toBeNull();
        expect(
          screen.getByRole("link", { name: sharedMessages.shared.providerAccess.connectAction }),
        ).toHaveAttribute("href", "/app/prj_example/providers");
        expect(screen.getByRole("link", { name: /Saved report/ })).toBeVisible();
        expect(analyze).not.toHaveBeenCalled();
        return;
      }
      const emptyPanel = screen.getByRole("region", { name: "Choose a data source" });
      expect(within(emptyPanel).getAllByRole("link")).toHaveLength(1);
      expect(
        within(emptyPanel).getByRole("link", { name: "Choose a data source" }),
      ).toHaveAttribute("href", "/app/prj_example/providers");
      expect(screen.queryByText("noSource")).not.toBeInTheDocument();
      expect(screen.queryByText("estimateRequired")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "brand" })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "domain" })).toBeDisabled();
      expect(screen.getByRole("link", { name: "Choose a data source" })).toHaveAttribute(
        "href",
        "/app/prj_example/providers",
      );
      expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
      expectExecutionBlocked();
      expect(screen.getByRole("link", { name: /Saved report/ })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
      expect(analyze).not.toHaveBeenCalled();
    },
  );
});

function expectExecutionBlocked() {
  const button = screen.queryByRole("button", { name: /^runAnalysis/ });
  if (button) expect(button).toBeDisabled();
  else expect(button).not.toBeInTheDocument();
}
