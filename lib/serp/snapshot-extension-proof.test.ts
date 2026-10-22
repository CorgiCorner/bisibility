import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { snapshotExtensionWasNotSent } from "./snapshot-extension-proof";

vi.mock("server-only", () => ({}));
const context = {
  version: 1,
  capturedAt: "2026-10-21T16:22:06.638Z",
  keyword: "flowtools",
  domain: "example.com",
  device: "desktop",
  connectionId: "connection",
  nextStart: 10,
  ended: false,
  location: {
    gl: "pl",
    hl: "pl",
    primaryGeoCode: null,
    primaryGeoName: "Poland",
    secondaryGeoName: "Poland",
  },
};
const state = {
  version: 1,
  state: "failed",
  nextStart: 10,
  ended: false,
  pages: [],
  requestId: "request",
  leaseUntil: "2026-10-21T16:31:49.932Z",
};
const binding = {
  id: "request",
  projectId: "project",
  keywordId: "keyword",
  rankCheckId: "check",
  connectionId: "connection",
  nextStart: 10,
  requestDepth: 10,
  leaseUntil: state.leaseUntil,
  context,
};
const check = {
  id: "check",
  keywordId: "keyword",
  provider: "serpapi",
  raw: { snapshotContinuation: context, snapshotExtension: state },
};
let pg: PGlite;
let tx: Parameters<typeof snapshotExtensionWasNotSent>[0];
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(
    `CREATE TABLE measurement_snapshot_request_bindings (id text,"projectId" text,"keywordId" text,"rankCheckId" text,"connectionId" text,binding jsonb); CREATE TABLE measurement_snapshot_request_attempts ("requestId" text,"operationId" text); CREATE TABLE measurement_snapshot_dispatch_proofs ("requestId" text); CREATE TABLE metering_paid_attempt_context(operation_id text);`,
  );
  await pg.query("INSERT INTO measurement_snapshot_request_bindings VALUES ($1,$2,$3,$4,$5,$6)", [
    "request",
    "project",
    "keyword",
    "check",
    "connection",
    JSON.stringify(binding),
  ]);
  tx = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const s = Prisma.sql(parts, ...values);
      const r = await pg.query<{
        binding: unknown;
        prepared: string;
        dispatched: string;
        intents: string;
      }>(s.text, s.values);
      return r.rows.map((row) => ({
        ...row,
        prepared: BigInt(row.prepared),
        dispatched: BigInt(row.dispatched),
        intents: BigInt(row.intents),
      }));
    },
    providerConnection: { findFirst: async () => ({ id: "connection" }) },
  } as never;
});
afterEach(async () => pg.close());
it("proves an exact retained legacy failed binding without attempts, intent or dispatch", async () => {
  expect(await snapshotExtensionWasNotSent(tx, "project", check)).toBe(true);
});
it.each(["project", "keyword", "check", "connection", "request", "context", "offset", "lease"])(
  "rejects %s drift rather than resetting failed from empty pages",
  async (field) => {
    const changed = structuredClone(check);
    if (field === "project") {
      expect(await snapshotExtensionWasNotSent(tx, "foreign", changed)).toBe(false);
      return;
    }
    if (field === "keyword") changed.keywordId = "other";
    if (field === "check") changed.id = "other";
    if (field === "connection") changed.raw.snapshotContinuation.connectionId = "other";
    if (field === "request") changed.raw.snapshotExtension.requestId = "other";
    if (field === "context") changed.raw.snapshotContinuation.keyword = "changed";
    if (field === "offset") changed.raw.snapshotExtension.nextStart = 20;
    if (field === "lease") changed.raw.snapshotExtension.leaseUntil = "2026-10-21T16:32:00Z";
    expect(await snapshotExtensionWasNotSent(tx, "project", changed)).toBe(false);
  },
);
it.each(["prepared", "dispatched", "intent"])(
  "blocks any retained %s proof from authorizing replay",
  async (kind) => {
    if (kind === "dispatched")
      await pg.query("INSERT INTO measurement_snapshot_dispatch_proofs VALUES ($1)", ["request"]);
    else {
      await pg.query("INSERT INTO measurement_snapshot_request_attempts VALUES ($1,$2)", [
        "request",
        "operation",
      ]);
      if (kind === "intent")
        await pg.query("INSERT INTO metering_paid_attempt_context VALUES ($1)", ["operation"]);
    }
    expect(await snapshotExtensionWasNotSent(tx, "project", check)).toBe(false);
  },
);
it("does not trust raw retryable without its retained binding", async () => {
  await pg.exec("DELETE FROM measurement_snapshot_request_bindings");
  expect(
    await snapshotExtensionWasNotSent(tx, "project", {
      ...check,
      raw: { ...check.raw, snapshotExtension: { ...state, state: "retryable" } },
    }),
  ).toBe(false);
});
it("limits running-state proof to the trusted failing request itself", async () => {
  const running = {
    ...check,
    raw: { ...check.raw, snapshotExtension: { ...state, state: "running" } },
  };
  expect(await snapshotExtensionWasNotSent(tx, "project", running)).toBe(false);
  expect(await snapshotExtensionWasNotSent(tx, "project", running, "wrong")).toBe(false);
  expect(await snapshotExtensionWasNotSent(tx, "project", running, "request")).toBe(true);
});
