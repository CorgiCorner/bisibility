import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectQueuedRankCheckBatch } from "./queued-inspect";

const m = vi.hoisted(() => {
  type Task = {
    id: string;
    state: string;
    providerTaskId: string | null;
    providerTag: string | null;
    updatedAt: Date;
  };
  const tasks: Task[] = [];
  const bind = vi.fn();
  const recovery = { credentials: {}, reconcile: vi.fn(), bindReadyTask: bind, finish: vi.fn() };
  const prisma = {
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    queuedRankCheckTask: {
      findMany: vi.fn(
        async (args: {
          where: { state?: string; updatedAt: { lt: Date }; id?: { notIn?: string[] } };
          take?: number;
        }) => {
          let result = tasks;
          if (args.where.state === "submitted")
            result = result.filter(
              (t) =>
                t.state === "submitted" &&
                t.providerTaskId &&
                t.updatedAt < args.where.updatedAt.lt &&
                !args.where.id?.notIn?.includes(t.id),
            );
          return args.take ? result.slice(0, args.take) : result;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; state: { in: string[] } };
          data: Partial<Task>;
        }) => {
          const task = tasks.find((t) => t.id === where.id && where.state.in.includes(t.state));
          if (task) Object.assign(task, data);
          return { count: task ? 1 : 0 };
        },
      ),
    },
    $transaction: vi.fn(
      async (op: ((client: typeof prisma) => Promise<unknown>) | Promise<unknown>[]) =>
        typeof op === "function" ? op(prisma) : Promise.all(op),
    ),
  };
  return {
    tasks,
    bind,
    recovery,
    prisma,
    ready: vi.fn(),
    get: vi.fn(),
    recover: vi.fn(),
    admission: vi.fn(),
    limit: vi.fn(),
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/provider-usage/admission-extension", () => ({
  ownAdmission: { assertRetrieval: m.admission },
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ login: "test", password: "test" }),
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  recoverQueuedDeploymentExecution: m.recover,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: m.limit,
  writeCooldown: vi.fn(),
}));
vi.mock("@/lib/providers/serp/dataforseo-queued", () => ({
  legacyDataForSeoQueuedTaskTag: (id: string) => `tag:${id}`,
  readyDataForSeoQueuedTasks: m.ready,
  fetchDataForSeoQueuedResult: m.get,
}));
vi.mock("./scheduler-mode", () => ({
  dispatcherClaimsAllowed: () => true,
  rankCheckSchedulerMode: () => "dispatcher",
}));

function add(id: string, age = 181, tag: string | null = null) {
  m.tasks.push({
    id,
    state: "submitted",
    providerTaskId: `native:${id}`,
    providerTag: tag,
    updatedAt: new Date(Date.now() - age * 1000),
  });
}
function response(id: string, code: number) {
  return { tasks: [{ id: `native:${id}`, status_code: code, cost: 0.0012 }] };
}

describe("queued Task GET fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tasks.length = 0;
    m.prisma.queuedRankCheckBatch.findUniqueOrThrow.mockImplementation(async () => ({
      connection: { id: "conn", credentialsEncrypted: "x" },
      state: "submitted",
      projectId: "project",
      tasks: m.tasks.map((t) => ({ ...t })),
    }));
    m.ready.mockResolvedValue([]);
    m.limit.mockResolvedValue({ success: true, accountKey: "key" });
    m.admission.mockResolvedValue(false);
  });
  it.each([20000, 40106])(
    "marks a missing task ready on terminal %s without accounting",
    async (code) => {
      add("a");
      m.get.mockResolvedValue(response("a", code));
      await inspectQueuedRankCheckBatch("batch");
      expect(m.tasks[0].state).toBe("ready");
      expect(m.get).toHaveBeenCalledTimes(1);
      expect(m.prisma.queuedRankCheckTask.updateMany).toHaveBeenCalledWith({
        where: { id: "a", state: { in: ["submitted"] } },
        data: { state: "ready", error: null },
      });
    },
  );
  it.each([20100, 20101, 40601, 40602])("leaves processing status %s untouched", async (code) => {
    add("a");
    m.get.mockResolvedValue(response("a", code));
    await inspectQueuedRankCheckBatch("batch");
    expect(m.get).toHaveBeenCalledOnce();
    expect(m.tasks[0].state).toBe("submitted");
    expect(m.prisma.queuedRankCheckTask.updateMany).not.toHaveBeenCalled();
  });
  it.each([true, false])("leaves GET error untouched (retryable=%s)", async (retryable) => {
    add("a");
    m.get.mockRejectedValue(new DataForSeoError("failure", retryable));
    await inspectQueuedRankCheckBatch("batch");
    expect(m.get).toHaveBeenCalledOnce();
    expect(m.tasks[0].state).toBe("submitted");
    expect(m.prisma.queuedRankCheckTask.updateMany).not.toHaveBeenCalled();
  });
  it("ignores a missing task in a successful envelope", async () => {
    add("a");
    m.get.mockResolvedValue({ tasks: [{ id: "other", status_code: 20000 }] });
    await inspectQueuedRankCheckBatch("batch");
    expect(m.get).toHaveBeenCalledOnce();
    expect(m.tasks[0].state).toBe("submitted");
  });
  it("propagates cancellation and starts no later GET", async () => {
    add("a");
    add("b");
    const controller = new AbortController();
    const reason = new Error("cancelled");
    m.get.mockImplementation(async () => {
      controller.abort(reason);
      throw reason;
    });
    await expect(inspectQueuedRankCheckBatch("batch", { signal: controller.signal })).rejects.toBe(
      reason,
    );
    expect(m.get).toHaveBeenCalledOnce();
    expect(m.tasks.every((task) => task.state === "submitted")).toBe(true);
  });
  it("stops fallback when its rate limit is unavailable", async () => {
    add("a");
    add("b");
    m.limit
      .mockResolvedValueOnce({ success: true, accountKey: "key" })
      .mockResolvedValueOnce({ success: false, accountKey: "key" });
    await inspectQueuedRankCheckBatch("batch");
    expect(m.get).not.toHaveBeenCalled();
    expect(m.limit).toHaveBeenCalledTimes(2);
  });
  it("reports a deadline crossed before fallback GET", async () => {
    add("a");
    const deadline = new Date(Date.now() + 10000);
    m.limit
      .mockResolvedValueOnce({ success: true, accountKey: "key" })
      .mockImplementationOnce(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(deadline);
        return { success: true, accountKey: "key" };
      });
    await expect(
      inspectQueuedRankCheckBatch("batch", { deadlineAt: deadline }),
    ).resolves.toMatchObject({ deadlineReached: true });
    expect(m.get).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("does not retrieve within grace", async () => {
    add("a", 179);
    await inspectQueuedRankCheckBatch("batch");
    expect(m.get).not.toHaveBeenCalled();
  });
  it("limits a pass to ten ordered tasks", async () => {
    for (let i = 0; i < 12; i++) add(String(i).padStart(2, "0"));
    m.get.mockImplementation(async (_credentials: unknown, id: string) => ({
      tasks: [{ id, status_code: 20000 }],
    }));
    await inspectQueuedRankCheckBatch("batch");
    expect(m.get).toHaveBeenCalledTimes(10);
    expect(m.prisma.queuedRankCheckTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: "asc" }, take: 10 }),
    );
    expect(m.tasks.filter((t) => t.state === "ready")).toHaveLength(10);
  });
  it("does not GET a task listed ready in this pass", async () => {
    add("a");
    m.ready.mockResolvedValue([{ tag: "tag:a", providerTaskId: "native:a" }]);
    await inspectQueuedRankCheckBatch("batch");
    expect(m.tasks[0].state).toBe("ready");
    expect(m.get).not.toHaveBeenCalled();
  });
  it("binds hosted recovery before marking ready", async () => {
    add("a", 181, "tag;cs=hosted;");
    m.recover.mockResolvedValue(m.recovery);
    m.get.mockResolvedValue(response("a", 40106));
    await inspectQueuedRankCheckBatch("batch");
    expect(m.bind).toHaveBeenCalledWith("a", "tag;cs=hosted;", "native:a");
    expect(m.tasks[0].state).toBe("ready");
  });
});
