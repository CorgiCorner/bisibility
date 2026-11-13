import { AgentReportDetailLoading } from "@/components/agent-reports/AgentReportDetailLoading";
import { challengeReportBlocks } from "@/components/agent-reports/challenge-report-layout";
import { CHALLENGE_TILE_IDS } from "@/lib/challenge-report/tile-state";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("challenge report loading", () => {
  it("mirrors the challenge tile grid inside the shared report frame", () => {
    const { container } = render(
      <AgentReportDetailLoading backLabel="All reports" membersOnlyLabel="Members" />,
    );
    expect(container.querySelector("[data-challenge-blocks]")).toHaveAttribute(
      "data-challenge-blocks",
      challengeReportBlocks.join(" "),
    );
    expect(container.querySelectorAll("[data-challenge-tile]")).toHaveLength(
      CHALLENGE_TILE_IDS.length,
    );
    expect(container.querySelector("[data-loading-table]")).toBeNull();
  });
});
