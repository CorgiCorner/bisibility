import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkDomainOverviewContract,
  checkSlackPreviewContract,
  SLACK_PREVIEW_CONTRACT,
} from "./doc-content-helpers.mjs";

const acceptedBullet = [
  "- Domain overview: estimated organic visibility, ranked keywords, and top pages",
  "  for any domain (requires a bring-your-own DataForSEO connection; metered). The",
  "  app and REST API are available; SDK, CLI, and MCP parity is still in progress.",
  "- Manual, daily, weekly, monthly, and custom cron schedules",
].join("\n");

function failuresFor(readme) {
  return checkDomainOverviewContract(readme);
}

describe("checkDomainOverviewContract", () => {
  it("accepts a wrapped bullet containing the full settled contract", () => {
    assert.deepEqual(failuresFor(acceptedBullet), []);
  });

  it("rejects a bullet missing app/API availability", () => {
    const readme = acceptedBullet.replace("The\n  app and REST API are available; ", "");
    const failures = failuresFor(readme);
    assert.ok(
      failures.some((f) => f.includes("The app and REST API are available")),
      `expected app/API availability failure, got ${JSON.stringify(failures)}`,
    );
  });

  it("rejects a bullet missing the bring-your-own requirement", () => {
    const readme = acceptedBullet.replace("requires a bring-your-own DataForSEO connection; ", "");
    const failures = failuresFor(readme);
    assert.ok(
      failures.some((f) => f.includes("requires a bring-your-own DataForSEO connection")),
      `expected BYO failure, got ${JSON.stringify(failures)}`,
    );
  });

  it("rejects a bullet missing the metered status", () => {
    const readme = acceptedBullet.replace("; metered", "");
    const failures = failuresFor(readme);
    assert.ok(
      failures.some((f) => f.includes("metered")),
      `expected metered failure, got ${JSON.stringify(failures)}`,
    );
  });

  it("rejects planned/not-yet wording on a continuation line", () => {
    const readme = acceptedBullet.replace(
      "SDK, CLI, and MCP parity is still in progress.",
      "SDK, CLI, and MCP parity is planned but not yet shipped.",
    );
    const failures = failuresFor(readme);
    assert.ok(
      failures.some((f) => f.includes("planned or not yet")),
      `expected planned/not-yet failure, got ${JSON.stringify(failures)}`,
    );
  });
});

describe("checkSlackPreviewContract", () => {
  it("accepts the exact contract across wrapped lines", () => {
    const wrapped = SLACK_PREVIEW_CONTRACT.replace(" Workspace", "\nWorkspace");
    assert.deepEqual(checkSlackPreviewContract([{ label: "README.md", source: wrapped }]), []);
  });

  it("reports a source missing the second sentence", () => {
    const firstSentenceOnly =
      "Slack tenant delivery is available as an API-only preview.";
    assert.deepEqual(
      checkSlackPreviewContract([{ label: "docs/architecture.mdx", source: firstSentenceOnly }]),
      ["docs/architecture.mdx is missing the exact Slack API-only preview contract."],
    );
  });

  it("reports every source that omits or changes the exact contract", () => {
    assert.deepEqual(
      checkSlackPreviewContract([
        { label: "README.md", source: SLACK_PREVIEW_CONTRACT },
        { label: "docs/guides/alerts.mdx", source: "Slack is not yet available." },
      ]),
      [
        "docs/guides/alerts.mdx is missing the exact Slack API-only preview contract.",
      ],
    );
  });
});
