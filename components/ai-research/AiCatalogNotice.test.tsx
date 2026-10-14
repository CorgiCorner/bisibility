import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-ai-research.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AiCatalogNotice } from "./AiCatalogNotice";

function notice(mode: "prompt" | "visibility", reason?: "no_source") {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={en}>
      <AiCatalogNotice projectId="prj_fixture" mode={mode} reason={reason} />
    </FeatureMessagesProvider>,
  );
}

describe("module-specific catalog guidance", () => {
  it("offers connection setup instead of claiming available provider presets without credentials", () => {
    notice("visibility", "no_source");
    expect(screen.getByRole("alert")).toHaveTextContent("Connect DataForSEO");
    expect(screen.getByRole("alert")).not.toHaveTextContent("mini/nano");
    expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute(
      "href",
      "/app/prj_fixture/integrations",
    );
  });
  it("keeps AI Visibility guidance relevant and exposes coverage details on hover", async () => {
    const user = userEvent.setup();
    notice("visibility");
    expect(screen.getByRole("alert")).toHaveTextContent("ChatGPT for the United States in English");
    expect(screen.getByRole("alert")).not.toHaveTextContent("mini/nano");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.hover(screen.getByRole("button", { name: "About available AI settings" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Other countries, languages and platforms require the live catalog.",
    );
  });
  it("keeps the approved prompt preset selectable and exposes pricing limits on keyboard focus", async () => {
    const user = userEvent.setup();
    notice("prompt");
    expect(screen.getByRole("alert")).toHaveTextContent("mini/nano preset");
    expect(screen.getByRole("alert")).not.toHaveTextContent("United States");
    await user.tab();
    expect(screen.getByRole("button", { name: "About available AI settings" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Extended settings require a fresh verified quote",
    );
  });
});
