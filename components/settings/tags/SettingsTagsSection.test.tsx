import {
  type SettingsTagActions,
  SettingsTagsSection,
} from "@/components/settings/tags/SettingsTagsSection";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { SettingsTagRow } from "@/lib/queries/tag-settings";
import projectPagesMessages from "@/messages/core/en/project-pages.json";
import projectSettingsTagsMessages from "@/messages/core/en/project-settings-tags.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const messages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsTagsMessages,
  projectPagesMessages,
);

const docs: SettingsTagRow = {
  id: "tag_docs",
  keywords: 2,
  name: "Docs",
  pages: 4,
  rule: {
    autoJoin: true,
    excludePatterns: [],
    kind: "path_pattern",
    pattern: "/docs/*",
    sitemapUrl: null,
    tagTargetingKeywords: false,
    urls: [],
  },
  ruleLabel: { kind: "pattern", pattern: "/docs/*" },
  segmentCount: 1,
  usage: [
    { kind: "alert", name: "Clicks drop" },
    { kind: "keyword_segment", name: "Docs terms" },
  ],
};

const guides: SettingsTagRow = {
  id: "tag_guides",
  keywords: 0,
  name: "Guides",
  pages: 0,
  rule: null,
  ruleLabel: { kind: "none" },
  segmentCount: 0,
  usage: [],
};

const actions: SettingsTagActions = {
  deleteTag: vi.fn(async () => ({ ok: true as const, value: { deleted: 1 } })),
  mergeTag: vi.fn(async () => ({ ok: true as const, value: { merged: true } })),
  previewRule: vi.fn(async () => ({ sample: [], total: 0, truncated: false })),
  renameTag: vi.fn(async () => ({ ok: true as const, value: { merged: false } })),
  saveRule: vi.fn(async () => undefined),
};

function renderSection(extra?: Partial<Parameters<typeof SettingsTagsSection>[0]>) {
  return renderWithFeatureMessages(
    <SettingsTagsSection
      actions={actions}
      canCreate
      canDelete
      canEdit
      projectId="prj_7Kd2Qf9m"
      rows={[docs, guides]}
      sitemaps={[]}
      {...extra}
    />,
    { messages },
  );
}

describe("SettingsTagsSection", () => {
  it("shows each tag, its rule, and where it is used", () => {
    renderSection();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("/docs/*")).toBeInTheDocument();
    expect(screen.getByText("1 alert, 1 keyword segment")).toBeInTheDocument();
    expect(
      screen.getByText("Alerts: Clicks drop Keyword segments: Docs terms"),
    ).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("not used yet")).toBeInTheDocument();
    expect(document.querySelector("[data-settings-tags-blocks]")).toHaveAttribute(
      "data-settings-tags-blocks",
      "header table where",
    );
  });

  it("opens the shared page-tag drawer for a new tag and an existing rule", async () => {
    const user = userEvent.setup();
    const view = renderSection();
    await user.click(screen.getByRole("button", { name: "New tag" }));
    expect(screen.getByRole("dialog", { name: "New tag" })).toBeInTheDocument();
    view.unmount();
    renderSection();
    await user.click(screen.getByRole("button", { name: "More actions for Docs" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit rule" }));
    expect(screen.getByRole("dialog", { name: "Edit Docs" })).toBeInTheDocument();
  });

  it("warns with the keyword and segment counts before delete", () => {
    renderSection({ initialDialog: { row: docs, type: "delete" } });
    expect(screen.getByRole("dialog", { name: "Remove Docs?" })).toHaveTextContent(
      "2 keywords and 1 segment use it.",
    );
  });

  it("states what a merge moves, including the page rule", async () => {
    const user = userEvent.setup();
    renderSection({ initialDialog: { row: docs, type: "merge" } });
    expect(screen.getByRole("dialog", { name: "Merge Docs into" })).toHaveTextContent(
      "4 pages, 2 keywords, 1 alert, 1 keyword segment move to Guides. The page rule moves because Guides has none.",
    );
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(actions.mergeTag).toHaveBeenCalledWith({
      projectId: "prj_7Kd2Qf9m",
      sourceId: "tag_docs",
      targetId: "tag_guides",
    });
  });

  it("refuses a rename onto a tag that already exists", async () => {
    const user = userEvent.setup();
    renderSection({ initialDialog: { row: guides, type: "rename" } });
    await user.clear(screen.getByRole("textbox", { name: "New name" }));
    await user.type(screen.getByRole("textbox", { name: "New name" }), "Docs");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Docs already exists. Merge into it instead.",
    );
    expect(actions.renameTag).not.toHaveBeenCalled();
  });
});

it("renders new server tag rows without remounting the section", () => {
  const { rerender } = renderSection();
  expect(screen.getByText("Docs")).toBeInTheDocument();
  rerender(
    <SettingsTagsSection
      actions={actions}
      canCreate
      canDelete
      canEdit
      projectId="prj_7Kd2Qf9m"
      rows={[{ ...docs, name: "Reference", pages: 19 }]}
      sitemaps={[]}
    />,
  );
  expect(screen.getByText("Reference")).toBeInTheDocument();
  expect(screen.queryByText("Docs")).not.toBeInTheDocument();
  expect(screen.queryByText("Guides")).not.toBeInTheDocument();
});
