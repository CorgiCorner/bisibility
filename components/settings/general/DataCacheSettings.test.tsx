import { renderWithGeneralSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { readProjectDataCache } from "@/lib/actions/project-data-cache";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DataCacheSettings } from "./DataCacheSettings";

vi.mock("@/lib/actions/project-data-cache", () => ({
  readProjectDataCache: vi.fn(),
  saveProjectDataCache: vi.fn(),
  deleteProjectDataCache: vi.fn(),
}));
it("keeps unavailable cache controls read-only until a fresh settings read succeeds", async () => {
  vi.mocked(readProjectDataCache).mockResolvedValue({
    ttlSeconds: 3600,
    page: { available: true, cursor: "0", entries: [] },
  });
  render(<DataCacheSettings projectId="prj_public" canEdit initial={null} />);
  const lifetime = screen.getByRole("button", { name: "Reuse results for" });
  expect(lifetime).toBeDisabled();
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  await waitFor(() => expect(lifetime).not.toBeDisabled());
  expect(lifetime).toHaveTextContent("1 hour");
});

it("keeps known cached results and pagination available when another cache source cannot be read", () => {
  render(
    <DataCacheSettings
      projectId="prj_public"
      canEdit
      initial={{
        ttlSeconds: 3600,
        page: {
          available: false,
          cursor: "next-page",
          entries: [
            {
              token: "known-result",
              country: "Poland",
              language: "en",
              keyword: "rank tracker",
              module: "keyword_research",
              provider: "DataForSEO",
              source: "related",
              expiresAt: "2030-10-19T12:00:00.000Z",
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("rank tracker")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Some cached results could not be loaded");
  expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  expect(screen.queryByText("No cached results on this page.")).not.toBeInTheDocument();
});
