import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSearchEngineIncidents } from "./parse";

const fixture = JSON.parse(
  readFileSync(new URL("./google-search-status-incidents.sample.json", import.meta.url), "utf8"),
) as unknown[];

describe("parseSearchEngineIncidents", () => {
  it("reads the public status sample, including a rollout that is still open", () => {
    const running = {
      begin: "2026-11-01T00:00:00+00:00",
      external_desc: "November 2026 core update",
      id: "running-update",
      modified: "2026-11-02T00:00:00+00:00",
      service_name: "Ranking",
      uri: "incidents/running-update",
    };
    const incidents = parseSearchEngineIncidents([...fixture, running]);

    expect(incidents).toHaveLength(4);
    expect(incidents[0]).toMatchObject({
      endsAt: new Date("2026-10-08T08:00:00+00:00"),
      externalId: "XhUDXP7A67iHCD2kmbVu",
      name: "September 2026 spam update",
      service: "Ranking",
      uri: "incidents/XhUDXP7A67iHCD2kmbVu",
    });
    expect(incidents[3]?.endsAt).toBeNull();
  });

  it("rejects a feed that is missing the incident name", () => {
    expect(() =>
      parseSearchEngineIncidents([{ id: "x", begin: "2026-01-01T00:00:00Z" }]),
    ).toThrow();
  });
});
