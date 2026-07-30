import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSettingOptions, setInstanceSetting } from "./set-instance-setting";

const query = vi.fn();
const db = { query };

describe("set instance setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a supported key and positive integer", () => {
    expect(
      parseSettingOptions(["--key", "email_daily_send_cap", "--value", "250"]),
    ).toEqual({
      key: "email_daily_send_cap",
      value: 250,
    });
  });

  it("rejects unknown keys and invalid values", () => {
    expect(() => parseSettingOptions(["--key", "unknown", "--value", "250"])).toThrow(
      "--key must be one of",
    );
    expect(() =>
      parseSettingOptions(["--key", "google_signup_cap", "--value", "0"]),
    ).toThrow("--value must be a positive safe integer");
    expect(() =>
      parseSettingOptions(["--key", "google_signup_cap", "--value", "1e2"]),
    ).toThrow("--value must be a positive safe integer");
  });

  it("upserts the value and reports the previous value", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ value: "100" }] })
      .mockResolvedValueOnce({ rows: [{ key: "email_daily_send_cap" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      setInstanceSetting(db, { key: "email_daily_send_cap", value: 250 }),
    ).resolves.toEqual({
      changed: true,
      key: "email_daily_send_cap",
      previousValue: "100",
      value: 250,
    });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining('SELECT "value"'),
      expect.stringContaining('INSERT INTO "instance_settings"'),
      "COMMIT",
    ]);
  });
});
