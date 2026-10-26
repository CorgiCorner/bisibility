import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { indexingData, indexingUrl } from "./indexing.test-support";
import { PageIndexingTab } from "./PageIndexingTab";

const path = "https://example.com/posts.xml";
const rows = Array.from({ length: 12 }, (_, i) => ({
  ...indexingUrl,
  url: `https://example.com/post-${i}`,
  sitemapUrl: path,
}));
function setup(load = vi.fn().mockResolvedValue({ data: rows, meta: { next_cursor: null } })) {
  const inspect = vi.fn().mockResolvedValue([]);
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <PageIndexingTab
        data={{ ...indexingData, sitemaps: [{ id: path, total: 12 }] }}
        projectId="prj_test"
        canInspect
        loadUrlsAction={load}
        inspectAction={inspect}
        loadDetailAction={async () => indexingUrl}
      />
    </FeatureMessagesProvider>,
  );
  return { load, inspect };
}
it("previews at most ten sitemap URLs without inspecting until explicit submission", async () => {
  const user = userEvent.setup();
  const { load, inspect } = setup();
  await user.click(screen.getByRole("button", { name: "Inspect URL" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("radio", { name: "From sitemap" }));
  await user.click(within(dialog).getByRole("button", { name: "Sitemap" }));
  await user.click(screen.getByRole("menuitem", { name: path }));
  const input = within(dialog).getByRole("textbox", { name: "URLs" });
  await waitFor(() =>
    expect(input).toHaveValue(
      rows
        .slice(0, 10)
        .map((r) => r.url)
        .join("\n"),
    ),
  );
  expect(load).toHaveBeenCalledWith({
    projectId: "prj_test",
    query: { sitemap: path, group: "not_checked", limit: 10 },
  });
  expect(inspect).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("radio", { name: "From sitemap" })).toBeChecked();
  fireEvent.change(input, { target: { value: rows[0].url } });
  await user.click(within(dialog).getByRole("button", { name: "Inspect URL" }));
  await waitFor(() =>
    expect(inspect).toHaveBeenCalledWith({ projectId: "prj_test", urls: [rows[0].url] }),
  );
});
it("fills remaining places with checked URLs and removes duplicates", async () => {
  const user = userEvent.setup();
  const load = vi
    .fn()
    .mockResolvedValueOnce({ data: [rows[3]], meta: { next_cursor: null } })
    .mockResolvedValue({ data: rows, meta: { next_cursor: null } });
  const { inspect } = setup(load);
  await user.click(screen.getByRole("button", { name: "Inspect URL" }));
  await user.click(screen.getByRole("radio", { name: "From sitemap" }));
  await user.click(screen.getByRole("button", { name: "Sitemap" }));
  await user.click(screen.getByRole("menuitem", { name: path }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  const input = screen.getByRole("textbox", { name: "URLs" });
  await waitFor(() =>
    expect(input).toHaveValue(
      [
        rows[3].url,
        ...rows
          .filter((r) => r.url !== rows[3].url)
          .slice(0, 9)
          .map((r) => r.url),
      ].join("\n"),
    ),
  );
  expect(inspect).not.toHaveBeenCalled();
});

it("ignores a late sitemap response after switching back to manual URLs", async () => {
  const user = userEvent.setup();
  let finish: (value: { data: typeof rows; meta: { next_cursor: null } }) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<{ data: typeof rows; meta: { next_cursor: null } }>((resolve) => {
        finish = resolve;
      }),
  );
  const { inspect } = setup(load);
  await user.click(screen.getByRole("button", { name: "Inspect URL" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("radio", { name: "From sitemap" }));
  await user.click(within(dialog).getByRole("button", { name: "Sitemap" }));
  await user.click(screen.getByRole("menuitem", { name: path }));
  expect(within(dialog).getByRole("button", { name: "Inspect URL" })).toBeDisabled();
  await user.click(within(dialog).getByRole("radio", { name: "Enter URLs" }));
  const input = within(dialog).getByRole("textbox", { name: "URLs" });
  fireEvent.change(input, { target: { value: "https://example.com/manual" } });
  await act(async () => {
    finish({ data: rows, meta: { next_cursor: null } });
  });
  expect(input).toHaveValue("https://example.com/manual");
  expect(load).toHaveBeenCalledOnce();
  expect(inspect).not.toHaveBeenCalled();
});

it("does not enable inspection when sitemap loading fails", async () => {
  const user = userEvent.setup();
  const { inspect } = setup(vi.fn().mockRejectedValue(new Error("temporary failure")));
  await user.click(screen.getByRole("button", { name: "Inspect URL" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("radio", { name: "From sitemap" }));
  await user.click(within(dialog).getByRole("button", { name: "Sitemap" }));
  await user.click(screen.getByRole("menuitem", { name: path }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Stored results could not be loaded",
  );
  expect(within(dialog).getByRole("button", { name: "Inspect URL" })).toBeDisabled();
  expect(inspect).not.toHaveBeenCalled();
});
