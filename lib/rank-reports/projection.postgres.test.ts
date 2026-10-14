import { AuthorizationError } from "@/lib/auth/authorize";
import { makePublicId } from "@/lib/db/public-id";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RankReportContext } from "./access";
import {
  rankReportTestDatabase,
  rankReportTestOptions,
  rankReportTestRequest,
} from "./postgres-test-fixture";
import { readRankReportFor } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "rank report real projection and project authorization",
  () => {
    let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    let context: RankReportContext;
    let project: { id: string; publicId: string };
    let keyword: { id: string; publicId: string };
    let checkIds: string[];
    beforeAll(async () => {
      fixture = await rankReportTestDatabase();
      ({ context, project, keyword, checkIds } = fixture);
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    });
    const options = rankReportTestOptions;
    const request = () => rankReportTestRequest(project, keyword);

    it("retains separate rank axes and opaque CID but excludes raw fragments and internal item IDs", async () => {
      const firstCheckId = checkIds[0];
      if (!firstCheckId) throw new Error("Missing normalized-item check fixture");
      const observation = await fixture.db.observationRun.findUniqueOrThrow({
        where: { rankCheckId: firstCheckId },
      });
      const item = await fixture.db.observationItem.create({
        data: {
          blockPosition: 4,
          cid: "18446744073709551615",
          createdAt: new Date("2026-10-12T10:04:00Z"),
          domain: "example.test",
          observationRunId: observation.id,
          ordinal: 1,
          positionInBlock: 2,
          rankAbsolute: 7,
          rankGroup: 2,
          rawFragment: { fixtureDiagnostic: "DO-NOT-EXPORT-DIAGNOSTIC" },
          resultKind: "organic_result",
          title: "Historical result",
          url: "https://example.test/historical-item",
        },
      });
      const page = await readRankReportFor(
        context,
        { ...request(), stream: "items" },
        options(),
        fixture.db,
      );
      expect(page.totalCount).toBe(1);
      expect(page.records).toMatchObject([
        {
          blockPosition: 4,
          cid: "18446744073709551615",
          positionInBlock: 2,
          rankAbsolute: 7,
          rankGroup: 2,
          recordedAt: "2026-10-12T10:04:00.000Z",
        },
      ]);
      expect(JSON.stringify(page)).not.toContain("DO-NOT-EXPORT-DIAGNOSTIC");
      expect(JSON.stringify(page)).not.toContain(item.id);
      expect(JSON.stringify(page)).not.toContain(context.actor.id);
    });

    it("refuses foreign IDs and revoked membership instead of reusing cached actor grants", async () => {
      const foreignProject = await fixture.db.project.create({
        data: {
          domain: "foreign.test",
          name: "Foreign",
          ownerId: context.actor.id,
          publicId: makePublicId("prj"),
        },
      });
      const foreignKeyword = await fixture.db.keyword.create({
        data: {
          createdAt: new Date("2026-01-01T00:00:00Z"),
          location: "Krakow",
          locationId: "report-location",
          projectId: foreignProject.id,
          publicId: makePublicId("kw"),
          text: "Foreign",
        },
      });
      await expect(
        readRankReportFor(
          context,
          { ...request(), selectedIds: [foreignKeyword.publicId] },
          options(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        readRankReportFor(
          context,
          {
            ...request(),
            projectId: foreignProject.publicId,
            selectedIds: [foreignKeyword.publicId],
          },
          options(),
          fixture.db,
        ),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await fixture.db.membership.delete({
        where: { userId_projectId: { projectId: project.id, userId: context.actor.id } },
      });
      await expect(
        readRankReportFor(context, request(), options(), fixture.db),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  },
);
