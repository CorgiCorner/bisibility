import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectPagesPasteDialog } from "./ProjectPagesPasteDialog";
import { ProjectPagesSources } from "./ProjectPagesSources";
import { pageSource } from "./project-pages-fixtures";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

function renderPages(node: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </FeatureMessagesProvider>,
  );
}

describe("ProjectPagesPasteDialog", () => {
  it("shows added, existing and rejected lines from the registry result", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({
      added: 1,
      existing: 1,
      rejected: [
        { line: 2, reason: "This URL is on another site.", value: "https://example.org/out" },
      ],
    }));
    renderPages(
      <ProjectPagesPasteDialog onAdded={vi.fn()} onClose={vi.fn()} onSubmit={onSubmit} open />,
    );
    await user.type(
      screen.getByLabelText("URLs"),
      "https://example.com/docs\nhttps://example.org/out",
    );
    await user.click(screen.getByRole("button", { name: "Add pages" }));
    const result = await screen.findByTestId("pages-paste-result");
    expect(result).toHaveTextContent("1 added");
    expect(result).toHaveTextContent("1 already listed");
    expect(result).toHaveTextContent(
      "Line 2: https://example.org/out - This URL is on another site.",
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("ProjectPagesSources", () => {
  it("hides write actions without permission", () => {
    renderPages(
      <ProjectPagesSources
        canWrite={false}
        onPaste={vi.fn()}
        onRefresh={vi.fn()}
        pending={false}
        projectId="prj_1"
        sources={[pageSource("sitemap", "not_connected")]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add source" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      "/app/prj_1/providers",
    );
  });
});
