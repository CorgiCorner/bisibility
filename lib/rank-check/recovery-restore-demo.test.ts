import { makePublicId } from "@/lib/db/public-id";
import { afterEach, expect, it, vi } from "vitest";
import { restoreRetainedRankResult } from "./recovery-restore";
import { recoveryResultWriteAllowed } from "./recovery-restore-gate";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
afterEach(() => vi.unstubAllEnvs());
it.each(["off", "observe", "legacy-read-only", "editable"])(
  "DV-4 direct %s restore stops before database access",
  async (mode) => {
    vi.stubEnv("DEMO_MODE", mode === "editable" ? "editable" : "");
    vi.stubEnv("READ_ONLY_DEMO", mode === "legacy-read-only" ? "1" : "0");
    vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
    vi.stubEnv("DEMO_OWNER_ID", makePublicId("usr"));
    vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
    vi.stubEnv("PROVIDER_RECOVERY", ["off", "observe"].includes(mode) ? mode : "on");
    const tx = new Proxy(
      {},
      {
        get: () => {
          throw new Error("Demo accessed database");
        },
      },
    );
    expect(await restoreRetainedRankResult(tx as never, "check", null, new Date())).toBe(false);
    expect(
      await recoveryResultWriteAllowed(tx as never, "check", { version: 1 } as never, new Date()),
    ).toBe(false);
  },
);
