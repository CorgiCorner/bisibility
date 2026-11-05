import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPageFixture } from "./RunPageFixtures";
import { RunPageTargets } from "./RunPageTargets";
import type { RunPageItem } from "./RunPageTypes";
import { useRunPageItems } from "./useRunPageItems";

const response = (items: RunPageItem[], cursor: string | null) =>
  ({
    ok: true,
    json: async () => ({ data: items, meta: { next_cursor: cursor } }),
  }) as unknown as Response;

function row(id: string, status: RunPageItem["status"]): RunPageItem {
  const base = runPageFixture.items[0];
  if (!base) throw new Error("missing fixture row");
  return {
    ...base,
    actualCostCents: 0.4,
    id,
    keyword: { ...base.keyword, publicId: `kw_${id}`, text: id },
    status,
  };
}

function receiptRow(id: string): RunPageItem {
  const quote = paymentQuote();
  return {
    ...row(id, "completed"),
    actualCostCents: 999,
    payment: {
      actionId: id,
      charge: { ...quote.charge, certainty: "measured", value: "7" },
      option: quote.option,
      quoteId: quote.id,
      state: "settled",
    },
  };
}

function Targets({ initial, version }: { initial: RunPageItem[]; version: number }) {
  const [error, setError] = useState("");
  const loaded = useRunPageItems(
    { projectRef: "prj_example", runId: "run_1" },
    initial,
    "page-2",
    version,
    setError,
    "refresh-error",
  );
  const run = {
    ...runPageFixture.run,
    outcome: "succeeded" as const,
    status: "completed" as const,
  };
  return (
    <>
      <p>{error}</p>
      <RunPageTargets
        busy={null}
        canMutate
        cursor={loaded.cursor}
        filter="all"
        items={loaded.items}
        onCancel={vi.fn()}
        onFilter={vi.fn()}
        onLoadMore={() => void loaded.loadMore()}
        onMutate={vi.fn()}
        projectRef="prj_example"
        run={run}
        summary={{ active: false, planned: false }}
      />
    </>
  );
}

function expectCostColumn() {
  expect(screen.getAllByText("$0.004")).toHaveLength(1);
  expect(screen.getByText("7 tokens")).toBeVisible();
  expect(screen.getByText("On your Example provider key")).toBeVisible();
  expect(screen.queryByText("Payment details unavailable")).toBeNull();
  expect(screen.getAllByText("$0.004").length).toBeGreaterThan(0);
  expect(screen.queryByText("$9.99")).toBeNull();
  expect(screen.queryByText("$0.40")).toBeNull();
}

describe("run target cost across item reloads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows exact confirmed provider cost without a receipt, and keeps the receipt row", async () => {
    const unpaid = row("unpaid", "failed");
    const paid = receiptRow("paid");
    const view = render(<Targets initial={[unpaid, paid]} version={0} />);
    expectCostColumn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([row("unpaid", "failed"), receiptRow("paid")], "page-2")),
    );
    view.rerender(<Targets initial={[unpaid, paid]} version={1} />);
    await act(async () => {});
    expectCostColumn();

    vi.mocked(fetch).mockResolvedValueOnce(response([row("unpaid-next", "completed")], null));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await act(async () => {});
    expect(screen.getAllByText("$0.004")).toHaveLength(2);
    expect(screen.getAllByText("7 tokens")).toHaveLength(1);
    expect(screen.queryByText("Payment details unavailable")).toBeNull();
    expect(screen.getAllByText("$0.004").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.40")).toBeNull();
    expect(screen.queryByText("$9.99")).toBeNull();
  });
});
