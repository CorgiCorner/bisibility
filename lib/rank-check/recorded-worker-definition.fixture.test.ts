import { DefinitionUnavailableError } from "@/lib/measurement-definitions/errors";
import type { DefinitionTransaction } from "@/lib/measurement-definitions/model";
import { claimDefinitionPaidCall } from "@/lib/measurement-definitions/worker-claim";
import { workerDefinitionOwner } from "@/lib/measurement-definitions/worker-session";
import type { ProviderRequest } from "@usagekit/providers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definitionClaimQueryFixture } from "./definition-claim.test-fixture";
import {
  recordedLiveWorkerDefinition,
  recordedQueuedWorkerSessions,
  resetRecordedWorkerDefinition,
} from "./recorded-worker-definition.test-fixture";
import type { RunCheckInput } from "./runner";

const location = {
  gl: "us",
  hl: "en",
  primaryGeoCode: 2840,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};
function input(overrides: Partial<RunCheckInput> = {}): RunCheckInput {
  return {
    connection: { id: "connection_1", provider: "dataforseo" },
    rankCheckId: "rank_1",
    projectId: "project_1",
    depth: 100,
    keyword: {
      id: "keyword_1",
      text: "rank tracker",
      domain: "example.com",
      device: "desktop",
      location,
    },
    schedule: { frequency: "manual" },
    stopOnMatch: false,
    ...overrides,
  };
}
function batch(priority = "high") {
  return {
    connection: { id: "connection_1", provider: "dataforseo" },
    projectId: "project_1",
    project: { domain: "example.com", defaults: { serpStopOnMatch: false } },
    priority,
    tasks: [
      {
        id: "qtask_1",
        keywordId: "keyword_1",
        rankCheckId: "rank_1",
        rankCheck: { requestedDepth: 100 },
        keyword: { text: "rank tracker", device: "desktop", locationRef: location },
      },
    ],
  } as unknown as Parameters<ReturnType<typeof recordedQueuedWorkerSessions>>[0];
}
function request(route: "live" | "queued", priority?: number): ProviderRequest {
  return {
    method: "POST",
    url:
      "https://api.dataforseo.com/v3/serp/google/organic/" +
      (route === "live" ? "live/advanced" : "task_post"),
    body: [
      {
        depth: 100,
        keyword: "rank tracker",
        device: "desktop",
        language_code: "en",
        search_param: "&nfpr=1",
        location_code: 2840,
        ...(priority === undefined ? {} : { priority }),
      },
    ],
  };
}

describe("recorded semantic worker producer", () => {
  beforeEach(() => resetRecordedWorkerDefinition());

  it.each([
    ["live", undefined],
    ["queued", 1],
  ] as const)(
    "rejects %s route/priority %s for the original high-priority queued owner",
    async (route, priority) => {
      const session = (await recordedQueuedWorkerSessions(workerDefinitionOwner)(batch())).get(
        "qtask_1",
      )!;
      await expect(
        session.beforeReserve.assertRequest({} as never, "op_1", request(route, priority)),
      ).rejects.toBeInstanceOf(DefinitionUnavailableError);
    },
  );

  it.each([
    ["normal", 1],
    ["high", 2],
  ] as const)(
    "accepts only the exact original %s queued priority",
    async (priority, nativePriority) => {
      const session = (
        await recordedQueuedWorkerSessions(workerDefinitionOwner)(batch(priority))
      ).get("qtask_1")!;
      await expect(
        session.beforeReserve.assertRequest({} as never, "op_1", request("queued", nativePriority)),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects an unrecognized batch priority even if the native queued body is valid", async () => {
    const session = (
      await recordedQueuedWorkerSessions(workerDefinitionOwner)(batch("urgent"))
    ).get("qtask_1")!;
    await expect(
      session.beforeReserve.assertRequest({} as never, "op_1", request("queued", 2)),
    ).rejects.toBeInstanceOf(DefinitionUnavailableError);
  });

  it("rejects queued task_post under a live owner", async () => {
    const session = (await recordedLiveWorkerDefinition(workerDefinitionOwner)(
      {} as never,
      input(),
      "dataforseo",
    ))!;
    await expect(
      session.beforeReserve.assertRequest({} as never, "op_1", request("queued", 2)),
    ).rejects.toBeInstanceOf(DefinitionUnavailableError);
    await expect(
      session.beforeReserve.assertRequest({} as never, "op_1", request("live")),
    ).resolves.toBeUndefined();
  });

  it("shares one genuine paid-call CAS permit across fallback provider sessions", async () => {
    const claim = vi.fn(definitionClaimQueryFixture());
    resetRecordedWorkerDefinition(claim);
    const owner = vi.fn(workerDefinitionOwner);
    const live = recordedLiveWorkerDefinition(owner);
    await live({} as never, input(), "serpapi");
    await live({} as never, input(), "dataforseo");
    expect(owner.mock.calls[1][0]).toBe(owner.mock.calls[0][0]);
    const paidClaims = claim.mock.calls.filter(([query]) =>
      (Array.isArray(query)
        ? query
        : (query as import("@/lib/generated/prisma/client").Prisma.Sql).strings
      )
        .join("?")
        .includes('UPDATE rank_checks SET "attemptCount"=1'),
    );
    expect(paidClaims).toHaveLength(1);
    await expect(
      claimDefinitionPaidCall(
        { $queryRaw: claim } as unknown as DefinitionTransaction,
        "rank_1",
        true,
      ),
    ).resolves.toBeNull();
  });

  it("honors the actual forwarded permit without another claim", async () => {
    const permit = await claimDefinitionPaidCall(
      { $queryRaw: definitionClaimQueryFixture() } as unknown as DefinitionTransaction,
      "rank_1",
      true,
    );
    const claim = vi.fn(definitionClaimQueryFixture());
    resetRecordedWorkerDefinition(claim);
    const owner = vi.fn(workerDefinitionOwner);
    await recordedLiveWorkerDefinition(owner)(
      {} as never,
      input({ definitionPermit: permit! }),
      "dataforseo",
    );
    expect(owner.mock.calls[0][0]).toBe(permit);
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects a forged supplied permit instead of replacing it", async () => {
    const supplied = Object.freeze({ rankCheckId: "rank_1" }) as NonNullable<
      RunCheckInput["definitionPermit"]
    >;
    await expect(
      recordedLiveWorkerDefinition(workerDefinitionOwner)(
        {} as never,
        input({ definitionPermit: supplied }),
        "dataforseo",
      ),
    ).rejects.toBeInstanceOf(DefinitionUnavailableError);
  });

  it("rejects a genuine permit belonging to another check instead of replacing it", async () => {
    const permit = await claimDefinitionPaidCall(
      { $queryRaw: definitionClaimQueryFixture() } as unknown as DefinitionTransaction,
      "rank_2",
      true,
    );
    await expect(
      recordedLiveWorkerDefinition(workerDefinitionOwner)(
        {} as never,
        input({ definitionPermit: permit! }),
        "dataforseo",
      ),
    ).rejects.toBeInstanceOf(DefinitionUnavailableError);
  });
});
