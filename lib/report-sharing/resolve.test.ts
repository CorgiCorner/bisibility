import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShareToken, hashShareToken } from "./token";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  dayUpsert: vi.fn(),
  findFirstReport: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    agentReport: { findFirst: mocks.findFirstReport },
    agentReportShareLink: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
    agentReportShareLinkDay: { upsert: mocks.dayUpsert },
  },
}));
vi.mock("next/server", () => ({ after: (task: () => unknown) => task() }));

import { recordShareView, resolveShareToken, scheduleShareView } from "./resolve";
import { createReportShareLink } from "./service";

const token = createShareToken();
const now = new Date("2026-06-01T00:00:00.000Z");

function link(overrides: Record<string, unknown> = {}) {
  return {
    expiresAt: null,
    id: "link-internal",
    project: { domain: "example.com", id: "project-internal", writeMode: "active" },
    reports: [
      {
        report: {
          body: sampleChallengeBody(),
          kind: "challenge_report",
          publicId: "agr_abcdefghijklmnopqrstuvwx",
          title: "30 days",
        },
      },
    ],
    revokedAt: null,
    settings: { version: 1 },
    ...overrides,
  };
}

describe("share token resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers revoked, expired, empty and unknown tokens the same way", async () => {
    expect(await resolveShareToken("short", now)).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    mocks.findUnique.mockResolvedValueOnce(null);
    expect(await resolveShareToken(token, now)).toBeNull();
    mocks.findUnique.mockResolvedValueOnce(link({ revokedAt: now }));
    expect(await resolveShareToken(token, now)).toBeNull();
    mocks.findUnique.mockResolvedValueOnce(
      link({ expiresAt: new Date("2026-05-01T00:00:00.000Z") }),
    );
    expect(await resolveShareToken(token, now)).toBeNull();
    mocks.findUnique.mockResolvedValueOnce(link({ reports: [] }));
    expect(await resolveShareToken(token, now)).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashShareToken(token) } }),
    );
  });

  it("stores only the hash when a link is created", async () => {
    mocks.findFirstReport.mockResolvedValue({ id: "report-internal" });
    mocks.create.mockResolvedValue({ publicId: "rsl_abcdefghijklmnopqrstuvwx" });
    const created = await createReportShareLink({
      actorId: "user-1",
      projectId: "project-internal",
      reportId: "agr_abcdefghijklmnopqrstuvwx",
    });
    expect(created?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const data = mocks.create.mock.calls[0]?.[0].data;
    expect(data.token).toBeUndefined();
    expect(data.tokenHash).toBe(hashShareToken(created?.token ?? ""));
    expect(JSON.stringify(data)).not.toContain(created?.token);
  });

  it("skips bots and prefetch, and stores no visitor fields", async () => {
    scheduleShareView("link-internal", new Headers({ "user-agent": "Twitterbot/1.0" }), now);
    expect(mocks.transaction).not.toHaveBeenCalled();
    scheduleShareView("link-internal", new Headers({ "user-agent": "Mozilla/5.0" }), now);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const operations = mocks.transaction.mock.calls[0]?.[0];
    expect(JSON.stringify(operations)).not.toMatch(/user-agent|referrer|ip/i);
    await recordShareView("link-internal", now);
    const recorded = JSON.stringify(mocks.dayUpsert.mock.calls.at(-1)?.[0]);
    expect(recorded).toContain("views");
    expect(recorded).not.toMatch(/userAgent|referrer|sourceIp/);
  });
});
