import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixtureHistoryPort, pagedHistory } from "./history.test-fixture";
import { KeywordDetailHistory } from "./KeywordDetailHistory";

describe("installed history workspace per-check URLs", () => {
  it("uses the same paginated observation records, dates and immutable per-check expectations", async () => {
    const { first, rest } = pagedHistory();
    const port = fixtureHistoryPort(first);
    port.readPage = vi.fn(async () => ({ ok: true as const, value: rest.observations }));
    port.readWindow = vi.fn(port.readWindow);
    port.readSnapshot = vi.fn(port.readSnapshot);
    render(<KeywordDetailHistory history={port} keyword="Stored target" timeZone="UTC" />);
    const urls = screen.getByRole("table", { name: "Per-check recorded URLs" });
    expect(urls.querySelectorAll("tbody tr")).toHaveLength(250);
    const record = first.observations.records[0];
    if (!record) throw new Error("Missing observation fixture");
    expect(within(urls).getByText(record.id).closest("tr")).toHaveTextContent(
      record.expectedUrlAtCheck ?? "",
    );
    expect(
      within(urls).getByText(record.id).closest("tr")?.querySelectorAll("time")[0],
    ).toHaveAttribute("dateTime", record.observedAt);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    await waitFor(() => expect(urls.querySelectorAll("tbody tr")).toHaveLength(320), {
      timeout: 30_000,
    });
    expect(
      screen.getByRole("table", { name: "Recorded observations" }).querySelectorAll("tbody tr"),
    ).toHaveLength(320);
    expect(port.readPage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ stream: "observations", cursor: "observations-next" }),
    );
    expect(port.readWindow).not.toHaveBeenCalled();
    expect(port.readSnapshot).not.toHaveBeenCalled();
  }, 60_000);

  it("removes the URL table along with observations after renewed access is refused", async () => {
    const { first } = pagedHistory(30, 25);
    const port = fixtureHistoryPort(first);
    port.readPage = async () => ({ ok: false, reason: "forbidden" });
    render(<KeywordDetailHistory history={port} keyword="Sensitive target" timeZone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("History access is unavailable.");
    expect(
      screen.queryByRole("table", { name: "Per-check recorded URLs" }),
    ).not.toBeInTheDocument();
  });
});
