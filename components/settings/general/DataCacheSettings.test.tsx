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
  fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  await waitFor(() => expect(lifetime).not.toBeDisabled());
  expect(lifetime).toHaveTextContent("1 hour");
});
