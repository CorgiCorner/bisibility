import { expect, test, vi } from "vitest";
import { catalog } from "./contract-fixtures.test-support";
import { loadNativeModelComposer } from "./page";
import type { ModelPlaygroundRuntime } from "./runtime-contract";

vi.mock("@/lib/queries/integrations", () => ({
  getIntegrationCategories: async () => [
    {
      id: "model",
      providers: [
        {
          id: "openrouter",
          connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
          status: "connected",
          credentialSource: "own",
          enabled: true,
        },
      ],
    },
  ],
}));
test("page metadata runs outside transactions after authorization", async () => {
  let active = false;
  let authorized = false;
  const states: boolean[] = [];
  const resolve = vi.fn(async () => {
    expect(authorized).toBe(true);
    states.push(active);
    return { catalog: catalog() };
  });
  const db = {
    $transaction: async (work: (tx: unknown) => unknown) => {
      active = true;
      try {
        return await work({ $queryRaw: async () => [] });
      } finally {
        active = false;
      }
    },
  };
  const runtime = {
    db,
    resolve,
    authorize: async () => {
      authorized = true;
      return { actorId: "actor" };
    },
  } as unknown as ModelPlaygroundRuntime;
  const page = await loadNativeModelComposer(
    { id: "project", publicId: "prj_project", ownerId: "owner", writeMode: "active" } as Parameters<
      typeof loadNativeModelComposer
    >[0],
    runtime,
  );
  expect(resolve).toHaveBeenCalledOnce();
  expect(states).toEqual([false]);
  expect(page.catalogs).toHaveLength(1);
});
