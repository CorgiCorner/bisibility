import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
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
        screen.getByText("Connect a supporting provider to unlock these fields."),
      ).toBeVisible();
      expect(screen.getAllByText("Supported providers: Fixture AI provider.")).toHaveLength(2);
      const emptyPanel = screen.getByRole("region", { name: "Connect a provider to get started" });
      expect(within(emptyPanel).getAllByRole("link")).toHaveLength(1);
      expect(within(emptyPanel).getByRole("link", { name: "Connect provider" })).toHaveAttribute(
        "href",
        "/app/prj_example/integrations",
      );
      expect(screen.queryByText("noSource")).not.toBeInTheDocument();
      expect(screen.queryByText("estimateRequired")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "brand" })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "domain" })).toBeDisabled();
      expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute(
        "href",
        "/app/prj_example/integrations",
      );
      expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
      expect(screen.getByRole("link", { name: /Saved report/ })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
      expect(analyze).not.toHaveBeenCalled();
    },
  );
});
