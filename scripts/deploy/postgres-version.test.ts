import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertMigrationPostgresVersion, requireSupportedPostgresVersion } from "./postgres-version";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  options: vi.fn(),
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      constructor(options: unknown) { mocks.options(options); }
      connect = mocks.connect;
      query = mocks.query;
      end = mocks.end;
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ rows: [{ server_version_num: "160015" }] });
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1/app_fixture");
  vi.stubEnv("DIRECT_URL", "postgresql://fixture:fixture@127.0.0.1/direct_fixture?schema=owned");
});
afterEach(() => vi.unstubAllEnvs());

describe("migration PostgreSQL preflight", () => {
  it.each(["150019", "140021", "90624"])("rejects unsupported server %s", (version) => {
    expect(() => requireSupportedPostgresVersion(version)).toThrow("PostgreSQL 16 or newer is required");
  });
  it.each(["160000", "160015", "170000", "180001"])("accepts minimum-compatible server %s", (version) => {
    expect(() => requireSupportedPostgresVersion(version)).not.toThrow();
  });
  it.each([undefined, null, "", "16.15", "160015invalid", "9999999999999999999"])("fails closed on invalid version %s", (version) => {
    expect(() => requireSupportedPostgresVersion(version)).toThrow("Cannot determine");
  });
  it("reads the migration connection without changing its schema or caller environment", async () => {
    const original = process.env.DIRECT_URL;
    await assertMigrationPostgresVersion();
    expect(mocks.options).toHaveBeenCalledWith(expect.objectContaining({ connectionString: original }));
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith("SHOW server_version_num");
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(process.env.DIRECT_URL).toBe(original);
  });
  it("closes the connection after an unsupported version or query failure", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ server_version_num: "150019" }] });
    await expect(assertMigrationPostgresVersion()).rejects.toThrow("PostgreSQL 15");
    const failure = new Error("owned query failure");
    mocks.query.mockRejectedValueOnce(failure);
    await expect(assertMigrationPostgresVersion()).rejects.toBe(failure);
    expect(mocks.end).toHaveBeenCalledTimes(2);
  });
});
