import messages from "@/messages/core/en/project-runs-rank-runs.json";
import { createTranslator } from "next-intl";
import { expect, it } from "vitest";
import { runPageFixture } from "./RunPageFixtures";
import { runTargetNote } from "./run-target-table-columns";

const baseCheck = runPageFixture.items[0].rankCheck;
if (!baseCheck) throw new Error("Missing fixture check");
const t = createTranslator({ locale: "en", messages, namespace: "projectRuns.rankRuns" });
it("explains incomplete coverage in the run note without outage or retry advice", () => {
  const item = {
    ...runPageFixture.items[0],
    status: "failed" as const,
    rankCheck: { ...baseCheck, errorCode: "organic_depth_not_covered" },
  };
  const note = runTargetNote(item, runPageFixture.run, "self-host", t, "en");
  expect(note).toContain("did not cover the requested depth");
  expect(note).toContain("no position or absence could be established");
  expect(note).not.toMatch(/temporarily unavailable|try again|retry|not charged/i);
});
it("keeps nearby codes separate from incomplete coverage", () => {
  const item = {
    ...runPageFixture.items[0],
    status: "failed" as const,
    rankCheck: {
      ...baseCheck,
      errorCode: "organic_depth_not_covered_note",
    },
  };
  expect(runTargetNote(item, runPageFixture.run, "self-host", t, "en")).toBe(
    t("targetPresentation.providerUnknown"),
  );
});
