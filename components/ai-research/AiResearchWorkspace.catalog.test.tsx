import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
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
          analyzeAction={analyze}
          history={[{ id: "agr_saved", title: "Saved report", createdAt: "2026-10-06" }]}
        />,
      );
      expect(screen.getByRole("alert")).toHaveTextContent("noSource");
      expect(screen.getByRole("link", { name: "openIntegrations" })).toHaveAttribute(
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
