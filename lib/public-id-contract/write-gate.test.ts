import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_ID_V3_LOCAL_RELEASE,
  publicIdV3WriteGateContext,
  readPublicIdV3WriteGate,
  releasePublicIdV3WriteGate,
  retargetPublicIdV3WriteGate,
  withPublicIdV3CutoverBypass,
} from "./write-gate";

function database(query: PublicIdMigrationDatabase["query"]): PublicIdMigrationDatabase {
  return { query };
}

describe("public ID v3 write gate", () => {
  it("requires an exact application release for production", () => {
    expect(() => publicIdV3WriteGateContext({ DEPLOYMENT_ENV: "production" })).toThrow(
      "exact lowercase 40-character commit SHA",
    );
    expect(
      publicIdV3WriteGateContext({
        APP_VERSION: "a".repeat(40),
        DEPLOYMENT_ENV: "production",
      }),
    ).toEqual({
      phase: "public-id-v3-n",
      releasePolicy: "operator",
      targetAppRelease: "a".repeat(40),
    });
  });

  it("uses automatic policy for explicit non-production environments", () => {
    for (const DEPLOYMENT_ENV of ["preview", "test", "development"]) {
      expect(publicIdV3WriteGateContext({ DEPLOYMENT_ENV })).toEqual({
        phase: "public-id-v3-n",
        releasePolicy: "automatic",
        targetAppRelease: PUBLIC_ID_V3_LOCAL_RELEASE,
      });
    }
  });

  it("rejects missing and unknown deployment environments", () => {
    expect(() => publicIdV3WriteGateContext({})).toThrow("DEPLOYMENT_ENV must be");
    expect(() => publicIdV3WriteGateContext({ DEPLOYMENT_ENV: "staging" })).toThrow(
      "DEPLOYMENT_ENV must be",
    );
    expect(() => publicIdV3WriteGateContext({ DEPLOYMENT_ENV: " Production " })).toThrow(
      "DEPLOYMENT_ENV must be",
    );
    expect(() =>
      publicIdV3WriteGateContext({
        APP_VERSION: ` ${"a".repeat(40)}`,
        DEPLOYMENT_ENV: "production",
      }),
    ).toThrow("exact lowercase 40-character commit SHA");
  });

  it("restores the previous session bypass after successful migration work", async () => {
    const query = vi
      .fn<PublicIdMigrationDatabase["query"]>()
      .mockResolvedValueOnce({ rows: [{ installed: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            blocked: true,
            phase: "public-id-v3-n",
            releasePolicy: "operator",
            releasedAppRelease: null,
            targetAppRelease: "a".repeat(40),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ value: "previous" }] })
      .mockResolvedValue({ rows: [{}] });

    await expect(withPublicIdV3CutoverBypass(database(query), async () => "done")).resolves.toBe(
      "done",
    );

    expect(query.mock.calls.slice(-3)).toEqual([
      [`SELECT current_setting($1, TRUE) AS "value"`, ["bisibility.public_id_write_gate_bypass"]],
      [
        `SELECT set_config($1, $2, FALSE)`,
        ["bisibility.public_id_write_gate_bypass", "public-id-v3-n"],
      ],
      [`SELECT set_config($1, $2, FALSE)`, ["bisibility.public_id_write_gate_bypass", "previous"]],
    ]);
  });

  it("refuses a bypass when the gate is absent or released", async () => {
    const missing = vi
      .fn<PublicIdMigrationDatabase["query"]>()
      .mockResolvedValueOnce({ rows: [{ installed: false }] });
    await expect(
      withPublicIdV3CutoverBypass(database(missing), async () => undefined),
    ).rejects.toThrow("requires the active release N write gate");
  });

  it("reports a missing control row as installed false and blocked true", async () => {
    const query = vi
      .fn<PublicIdMigrationDatabase["query"]>()
      .mockResolvedValueOnce({ rows: [{ installed: true }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(readPublicIdV3WriteGate(database(query))).resolves.toEqual({
      blocked: true,
      installed: false,
      phase: null,
      releasePolicy: null,
      releasedAppRelease: null,
      targetAppRelease: null,
    });
  });

  it("retargets only an active gate in the expected phase", async () => {
    const context = publicIdV3WriteGateContext({
      APP_VERSION: "b".repeat(40),
      DEPLOYMENT_ENV: "production",
    });
    const query = vi
      .fn<PublicIdMigrationDatabase["query"]>()
      .mockResolvedValueOnce({ rows: [{ installed: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            blocked: true,
            phase: "public-id-v3-n",
            releasePolicy: "operator",
            targetAppRelease: "a".repeat(40),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ blocked: true }] })
      .mockResolvedValueOnce({ rows: [{ installed: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            blocked: true,
            phase: "public-id-v3-n",
            releasePolicy: "operator",
            targetAppRelease: "b".repeat(40),
          },
        ],
      });

    await expect(retargetPublicIdV3WriteGate(database(query), context)).resolves.toMatchObject({
      blocked: true,
      targetAppRelease: "b".repeat(40),
    });
  });

  it("releases only the matching deployment context", async () => {
    const context = publicIdV3WriteGateContext({
      DEPLOYMENT_ENV: "test",
    });
    const query = vi
      .fn<PublicIdMigrationDatabase["query"]>()
      .mockResolvedValueOnce({ rows: [{ blocked: false }] });
    await expect(releasePublicIdV3WriteGate(database(query), context)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.stringContaining(`"releasePolicy" = $3`), [
      PUBLIC_ID_V3_LOCAL_RELEASE,
      "public-id-v3-n",
      "automatic",
    ]);
  });
});
