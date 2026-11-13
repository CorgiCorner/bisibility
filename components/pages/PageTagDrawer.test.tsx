import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { emptyPageTagForm } from "@/lib/schemas/page-tag";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PagesByTagPanel } from "./PagesByTagPanel";
import { PageTagDrawer } from "./PageTagDrawer";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

function renderWithMessages(node: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </FeatureMessagesProvider>,
  );
}

describe("PageTagDrawer", () => {
  it("previews a path pattern and explains a by-hand rule", async () => {
    const user = userEvent.setup();
    const preview = vi.fn(async () => ({ sample: ["/docs"], total: 6, truncated: true }));
    renderWithMessages(
      <PageTagDrawer
        canWrite
        initial={{ ...emptyPageTagForm, tagName: "Docs" }}
        onClose={vi.fn()}
        open
        options={[{ id: "tag_docs", keywordCount: 3, name: "Docs" }]}
        preview={preview}
        previewDelayMs={0}
        save={vi.fn(async () => undefined)}
        sitemaps={["https://example.com/sitemap.xml"]}
        title="New tag"
      />,
    );

    expect(screen.getByText("Docs is already on 3 keywords")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /^Pattern/u }), "/docs");
    expect(await screen.findByText("Matches 6 pages")).toBeInTheDocument();
    expect(screen.getByText("and 5 more")).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "path_pattern", pattern: "/docs" }),
    );

    const pattern = screen.getByRole("textbox", { name: /^Pattern/u });
    await user.clear(pattern);
    await user.click(pattern);
    await user.paste(`/${Array.from({ length: 17 }, () => "*").join("/")}`);
    await user.click(screen.getByRole("button", { name: "Save tag" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A pattern can use at most 16 wildcards.");

    await user.click(screen.getByRole("radio", { name: "By hand" }));
    expect(
      screen.getByText("No rule matches pages. Add this tag to pages by hand."),
    ).toBeInTheDocument();
  });
});

describe("PagesByTagPanel", () => {
  it("lists keyword-only tags and links to settings", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithMessages(
      <PagesByTagPanel
        canCreate
        canDelete
        canWrite
        onAddToPages={onAdd}
        onEdit={vi.fn()}
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onRemove={vi.fn(async () => undefined)}
        projectId="prj_story"
        view={{
          keywordOnly: [{ id: "tag_blog", keywordCount: 2, name: "Blog" }],
          options: [],
          rows: [],
          sitemaps: [],
          tagCount: 0,
        }}
      />,
    );

    expect(screen.getByText(/One set of tags for the whole project/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage tags in Settings" })).toHaveAttribute(
      "href",
      "/app/prj_story/settings/tags",
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Add to pages" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "Blog" }));
  });
});
