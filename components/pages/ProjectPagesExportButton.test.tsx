import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import pagesMessages from "@/messages/core/en/project-pages.json";
import searchMessages from "@/messages/core/en/project-search-insights.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectPagesScreen } from "./ProjectPagesScreen";
import { ProjectPagesToolbar } from "./ProjectPagesToolbar";
import { connectedSources, pageRow, pagesList, pagesQuery } from "./project-pages-fixtures";

const mocks = vi.hoisted(() => ({ download: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/ui/download", () => ({ downloadTextFile: mocks.download }));
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
const messages = mergeMessageCatalogs(sharedMessages, pagesMessages, searchMessages);
const columns = [
  { id: "path", header: "Page", meta: { lockVisible: true } },
  { id: "sitemap", header: "Sitemap" },
  { id: "clicks", header: "Clicks" },
];
const exportCsv = vi.fn(async () => ({
  status: "ok" as const,
  csv: "url,path",
  filename: "pages.csv",
  rows: 1,
}));
function toolbar(total: number) {
  return renderWithFeatureMessages(
    <ProjectPagesToolbar
      canWrite
      columns={columns}
      counts={pagesList([pageRow()]).counts}
      exportCsv={exportCsv}
      total={total}
      onFilters={vi.fn()}
      onNewTag={vi.fn()}
      onQuery={vi.fn()}
      onSearchChange={vi.fn()}
      pending={false}
      query={pagesQuery}
      search=""
      showStatus={false}
      sitemapChecked
      tags={[]}
    />,
    { messages, wrapper: TooltipProvider },
  );
}
it("exports the current visible columns in table order and downloads through the shared helper", async () => {
  toolbar(121);
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Hide Clicks column" }));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(exportCsv).toHaveBeenCalledWith(["path", "sitemap"]));
  expect(mocks.download).toHaveBeenCalledWith(
    "\uFEFFurl,path",
    "pages.csv",
    "text/csv;charset=utf-8",
  );
});
it("disables export for an empty filtered view and explains why", () => {
  toolbar(0);
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});
it("does not offer export without permission", () => {
  renderWithFeatureMessages(
    <ProjectPagesScreen
      canExport={false}
      canWrite={false}
      canCreateTags={false}
      canDeleteTags={false}
      canEditTags={false}
      actions={{ exportCsv } as never}
      initialList={pagesList([pageRow()])}
      initialQuery={pagesQuery}
      projectId="prj_1"
      sources={connectedSources()}
    />,
    { messages, wrapper: TooltipProvider },
  );
  expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
});
it("explains the bound and does not download a partial file", async () => {
  exportCsv.mockResolvedValueOnce({ status: "too_large", limit: 5000 } as never);
  toolbar(5001);
  const before = mocks.download.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("No file was downloaded"), {
      severity: "warning",
    }),
  );
  expect(mocks.download).toHaveBeenCalledTimes(before);
});

it("offers and executes export through the complete screen with permission", async () => {
  const action = vi
    .fn()
    .mockResolvedValue({ status: "ok", csv: "url,path", filename: "pages.csv", rows: 1 });
  const list = pagesList([pageRow()]);
  renderWithFeatureMessages(
    <ProjectPagesScreen
      canExport
      canWrite={false}
      canCreateTags={false}
      canDeleteTags={false}
      canEditTags={false}
      actions={{ exportCsv: action } as never}
      initialList={list}
      initialQuery={pagesQuery}
      projectId="prj_1"
      sources={connectedSources()}
    />,
    { messages, wrapper: TooltipProvider },
  );
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "prj_1",
        window: list.period,
        columns: expect.arrayContaining(["path", "cwv"]),
      }),
    ),
  );
});

it.each([
  ["sitemap_not_checked", "notCheckedHint"],
  ["sitemap_incomplete", "freshnessHint"],
] as const)("explains %s without starting a download", async (status, hint) => {
  exportCsv.mockResolvedValueOnce({ status } as never);
  toolbar(2);
  const downloads = mocks.download.mock.calls.length;
  const toasts = mocks.toast.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(toasts + 1));
  expect(mocks.toast).toHaveBeenLastCalledWith(pagesMessages.projectPages.sitemapState[hint], {
    severity: "warning",
  });
  expect(mocks.download).toHaveBeenCalledTimes(downloads);
});
