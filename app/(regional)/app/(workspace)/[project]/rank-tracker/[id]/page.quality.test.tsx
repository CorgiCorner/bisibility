import { detailCheck, detailTarget } from "@/lib/keyword-detail/quality-test-fixture";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import {
  type CapturedDetailHeader,
  type CapturedDetailHistory,
  configureDetailPage,
  detailPageParams,
  getDetailPageMocks,
} from "@/tests/keyword-detail-quality-page";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KeywordDetailPage from "./page";

const detailPageMocks = getDetailPageMocks();
vi.mock("@/components/keywords/KeywordDataRefresh", () => ({
  KeywordDataRefresh: () => <button type="button">Refresh stored data</button>,
}));

describe("actual keyword detail route snapshot wiring", () => {
  it.each([new RankReportCapacityError(), new RankReportSnapshotConflictError()])(
    "keeps an initial report refusal controlled without a legacy header fallback (%s)",
    async (cause) => {
      configureDetailPage();
      detailPageMocks.paired.mockRejectedValueOnce(cause);
      const view = render(await KeywordDetailPage({ params: detailPageParams() }));
      expect(view.getByRole("status")).toBeVisible();
      expect(view.getByRole("button", { name: "Refresh stored data" })).toBeVisible();
      expect(detailPageMocks.header).not.toHaveBeenCalled();
      expect(detailPageMocks.history).not.toHaveBeenCalled();
      expect(detailPageMocks.rawLoad).not.toHaveBeenCalled();
      expect(detailPageMocks.paid).not.toHaveBeenCalled();
    },
  );
  it("forwards the same frozen header and initial history, with no legacy URL card or paid mount call", async () => {
    const f = configureDetailPage();
    render(await KeywordDetailPage({ params: detailPageParams() }));
    expect(detailPageMocks.paired).toHaveBeenCalledOnce();
    const [header] = detailPageMocks.header.mock.calls[0] as [CapturedDetailHeader];
    const [history] = detailPageMocks.history.mock.calls[0] as [CapturedDetailHistory];
    expect(header.quality).toBe(f.captured().quality);
    expect(history.history.initial).toBe(f.captured().history);
    expect(header.quality.asOf).toBe(history.history.initial.observations.asOf);
    expect(header.quality.sourceDigest).toBe(history.history.initial.attempts.sourceDigest);
    expect(header.keyword).toMatchObject({ position: 6, bestPosition: 6 });
    expect(detailPageMocks.legacyUrls).not.toHaveBeenCalled();
    expect(detailPageMocks.rawLoad).not.toHaveBeenCalled();
    expect(detailPageMocks.paid).not.toHaveBeenCalled();
  });

  it("uses the pending current-unknown path while retaining the independent historical rank/Best", async () => {
    const f = configureDetailPage({ ...detailTarget(), expectedScope: null });
    render(await KeywordDetailPage({ params: detailPageParams() }));
    expect(detailPageMocks.header).not.toHaveBeenCalled();
    const [pending] = detailPageMocks.pending.mock.calls[0] as [CapturedDetailHeader];
    expect(pending.rankState).toBe("unknown");
    expect(pending.quality).toBe(f.captured().quality);
    expect(pending.quality.rankQuality.current).toMatchObject({
      evidence: "unknown",
      position: null,
    });
    expect(pending.quality.rankQuality.lastKnown.current?.position).toBe(6);
    expect(pending.quality.best?.definitionOrigin).toBe("last_known_definition");
    expect(detailPageMocks.history).toHaveBeenCalledOnce();
  });

  it("keeps a qualified rank above100 in the normal header path", async () => {
    configureDetailPage(detailTarget([detailCheck(0, 120, { requestedDepth: 200 })]));
    render(await KeywordDetailPage({ params: detailPageParams() }));
    const [header] = detailPageMocks.header.mock.calls[0] as [CapturedDetailHeader];
    expect(header.quality.rankQuality.current).toMatchObject({
      evidence: "positive",
      position: 120,
    });
    expect(detailPageMocks.pending).not.toHaveBeenCalled();
  });
});
