import { describe, expect, it } from "vitest";
import { queuedRankCheckModeAuthorization } from "./queued-mode";

describe("queued rank-check scheduler authorization", () => {
  it("allows the complete queued lifecycle only in dispatcher mode", () => {
    expect(queuedRankCheckModeAuthorization("dispatcher", null)).toMatchObject({
      allowPaidRetrieval: true,
      allowPrepare: true,
      allowSubmit: true,
    });
  });

  it.each(["submitted", "ready", "ambiguous", "submitting"])(
    "allows cutover recovery for already-paid or ambiguous state %s",
    (state) => {
      expect(queuedRankCheckModeAuthorization("cutover", state)).toMatchObject({
        allowPaidRetrieval: true,
        allowPrepare: true,
        allowSubmit: false,
      });
    },
  );

  it("blocks a new batch and a prepared batch from paid work in cutover", () => {
    expect(queuedRankCheckModeAuthorization("cutover", null)).toMatchObject({
      allowPaidRetrieval: false,
      allowPrepare: false,
      allowSubmit: false,
    });
    expect(queuedRankCheckModeAuthorization("cutover", "prepared")).toMatchObject({
      allowPaidRetrieval: false,
      allowPrepare: true,
      allowSubmit: false,
    });
  });

  it("blocks nonterminal dispatcher work in legacy mode", () => {
    expect(queuedRankCheckModeAuthorization("legacy", "submitted")).toMatchObject({
      allowPaidRetrieval: false,
      allowPrepare: false,
      allowSubmit: false,
    });
  });
});
