import { createMeter } from "@usagekit/meter";
import { expect, it, vi } from "vitest";
import type { UsageEntry } from "./mapping";
import { createShadowEngine } from "./shadow-engine";
import { createPostgresShadowHandoffs } from "./shadow-handoff";
import { createPostgresStore } from "./store/index";
import { fixture } from "./store/test-fixture";

const entry: UsageEntry = {
  id: "cross-process-receipt",
  ownerId: "owner",
  projectId: "project",
  connectionId: "connection",
  provider: "search",
  feature: "rank_check",
  source: "api",
  createdAt: new Date("2026-09-23T12:00:00Z"),
  costCents: "0.0100",
  usageQuantity: "1",
  measurementStatus: "recorded",
  cached: false,
  failed: false,
};

it("hands an active dispatch lease to a second Prisma client and fences the previous holder", async () => {
  const f = await fixture();
  const otherClient = f.connect();
  try {
    const failure = vi.fn();
    const firstHandoffs = createPostgresShadowHandoffs({
      prisma: f.client(),
      namespace: "test",
      schema: f.schema,
    });
    const first = createShadowEngine({
      meter: createMeter({ store: f.store, clock: f.clock }),
      clock: f.clock,
      namespace: "test",
      sink: vi.fn(),
      failure,
      handoffs: firstHandoffs,
    });
    await first.begin(entry, { cents: "1", units: "1" }, 1000);
    const payload = first.handoff(entry.id);
    expect(payload?.kind).toBe("lease");

    const otherHandoffs = createPostgresShadowHandoffs({
      prisma: otherClient,
      namespace: "test",
      schema: f.schema,
    });
    expect(await otherHandoffs.load(entry)).toMatchObject({
      operationId: entry.id,
      leaseId: payload?.leaseId,
      kind: "lease",
      expiresAt: payload?.expiresAt,
    });
    const otherStore = await createPostgresStore({
      prisma: otherClient,
      clock: f.clock,
      schema: f.schema,
    });
    const second = createShadowEngine({
      meter: createMeter({ store: otherStore, clock: f.clock }),
      clock: f.clock,
      namespace: "test",
      sink: vi.fn(),
      failure,
      handoffs: otherHandoffs,
    });
    await second.record(entry);
    expect(failure).not.toHaveBeenCalled();
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("settled");
    expect(await firstHandoffs.load(entry)).toBeUndefined();

    const secondEntry = { ...entry, id: "recovered-receipt" };
    await first.begin(secondEntry, { cents: "1", units: "1" }, 1000);
    const oldHandoff = first.handoff(secondEntry.id);
    if (!oldHandoff) throw new Error("Missing old handoff");
    f.clock.advance(1001);
    const [recovery] = await Promise.allSettled([
      second.resume(secondEntry, oldHandoff),
      firstHandoffs.save(secondEntry, oldHandoff),
    ]);
    expect(recovery.status).toBe("fulfilled");
    expect((await otherHandoffs.load(secondEntry))?.kind).toBe("recovery");
    await expect(firstHandoffs.save(secondEntry, oldHandoff)).rejects.toThrow(
      "Shadow handoff was fenced out",
    );
    await firstHandoffs.clear(secondEntry, oldHandoff.leaseId);
    expect((await otherHandoffs.load(secondEntry))?.kind).toBe("recovery");
    await first.record(secondEntry);
    expect(failure).toHaveBeenCalledWith(secondEntry, "record");
    await second.record(secondEntry);
    expect(
      (
        await f.store.getOperation({
          namespace: "test",
          principal: "owner",
          operationId: secondEntry.id,
        })
      )?.state,
    ).toBe("settled");
  } finally {
    await otherClient.$disconnect();
    await f.close();
  }
});
